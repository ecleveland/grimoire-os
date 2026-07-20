import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import NewBackgroundPage from '../page';

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();
const mockUseApiQueryAll = vi.fn();
const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

// The embedded BackgroundForm loads the feat picker options via useApiQueryAll.
vi.mock('@/lib/query', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/query')>()),
  useApiQueryAll: (path: string) => mockUseApiQueryAll(path),
  invalidateApiPath: vi.fn(),
}));

vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({}),
}));

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Gravedigger' } });
}

describe('NewBackgroundPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { userId: 'u1' } });
    mockUseApiQueryAll.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

  it('renders nothing while auth is still hydrating (no sign-in flash)', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null, isLoading: true });
    const { container } = render(<NewBackgroundPage />);
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('prompts unauthenticated visitors to sign in instead of rendering the form', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });

    render(<NewBackgroundPage />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('creates the background and redirects to the list', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ id: 'bg-hb', name: 'Gravedigger' });

    render(<NewBackgroundPage />);
    fillRequired();
    // Skills are a controlled toggle group now (VEG-474).
    await user.click(screen.getByRole('button', { name: 'Insight', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Religion', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Create background' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/srd/backgrounds',
        expect.objectContaining({ method: 'POST' })
      );
    });
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body).toEqual(
      expect.objectContaining({
        name: 'Gravedigger',
        skillProficiencies: ['Insight', 'Religion'],
        languages: 0,
        originFeatId: null,
        originFeatOption: null,
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Background created');
    expect(mockPush).toHaveBeenCalledWith('/srd/backgrounds');
  });

  it('toasts the API error message and stays on the page', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue(new Error('You already have a background with this name'));

    render(<NewBackgroundPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create background' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('You already have a background with this name');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue('boom');

    render(<NewBackgroundPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create background' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create background');
    });
  });

  it('rejects a typed-but-unpicked origin feat with a toast, without calling the API', async () => {
    const user = userEvent.setup();

    render(<NewBackgroundPage />);
    fillRequired();
    fireEvent.change(screen.getByLabelText(/^Origin feat$/), { target: { value: 'Alert' } });
    await user.click(screen.getByRole('button', { name: 'Create background' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Pick the origin feat from the list (SRD or one of your homebrew feats)'
      );
    });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
