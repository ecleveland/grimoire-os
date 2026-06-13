import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import NewFeatPage from '../page';

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();
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

function fillRequired() {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Lucky Dodge' } });
  fireEvent.change(screen.getByLabelText(/^Description/), {
    target: { value: 'You twist away from danger.' },
  });
}

describe('NewFeatPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: { userId: 'u1' } });
  });

  it('renders nothing while auth is still hydrating (no sign-in flash)', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null, isLoading: true });
    const { container } = render(<NewFeatPage />);
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('prompts unauthenticated visitors to sign in instead of rendering the form', () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });

    render(<NewFeatPage />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('creates the feat and redirects to the list', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue({ id: 'hb-1', name: 'Lucky Dodge' });

    render(<NewFeatPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create feat' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/srd/feats',
        expect.objectContaining({ method: 'POST' })
      );
    });
    const body = JSON.parse(mockApiFetch.mock.calls[0][1].body);
    expect(body).toEqual(
      expect.objectContaining({
        name: 'Lucky Dodge',
        description: 'You twist away from danger.',
        prerequisite: null,
        benefits: null,
        category: null,
        repeatable: false,
      })
    );
    expect(toast.success).toHaveBeenCalledWith('Feat created');
    expect(mockPush).toHaveBeenCalledWith('/srd/feats');
  });

  it('toasts the API error message and stays on the page', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue(new Error('You already have a feat with this name'));

    render(<NewFeatPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create feat' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('You already have a feat with this name');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error rejections', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockRejectedValue('boom');

    render(<NewFeatPage />);
    fillRequired();
    await user.click(screen.getByRole('button', { name: 'Create feat' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to create feat');
    });
  });
});
