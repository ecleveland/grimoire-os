import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import EditBackgroundPage from '../page';
import { invalidateApiPath } from '@/lib/query';
import type { SrdBackground } from '@/lib/types';

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
  useParams: () => ({ id: 'bg-hb' }),
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

const ownBackground: SrdBackground = {
  id: 'bg-hb',
  name: 'Gravedigger',
  description: 'Tending the resting places of the dead.',
  skillProficiencies: ['Insight'],
  toolProficiencies: [],
  languages: 0,
  personalityTraits: [],
  ideals: [],
  bonds: [],
  flaws: [],
  originFeat: { id: 'feat-alert', name: 'Alert' },
  originFeatOption: null,
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<EditBackgroundPage />, { wrapper }) };
}

describe('EditBackgroundPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: false,
      isLoading: false,
      user: { userId: 'u1' },
    });
    mockUseApiQueryAll.mockReturnValue({
      data: [{ id: 'feat-alert', name: 'Alert' }],
      isLoading: false,
      isError: false,
    });
    mockApiFetch.mockResolvedValue(ownBackground);
  });

  it('waits for auth hydration before judging edit rights (no false denial mid-hydration)', async () => {
    // Pre-hydration the provider reports user:null / isLoading:true. The GET can
    // resolve before auth settles; canEdit must not be evaluated against the
    // null user, or a legitimate owner gets the denial screen (VEG-320).
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      isLoading: true,
      user: null,
    });

    renderPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/srd/backgrounds/bg-hb'));
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByText(/only edit your own/)).not.toBeInTheDocument();
  });

  it('loads the background and prefills the form for its owner', async () => {
    renderPage();

    expect(await screen.findByDisplayValue('Gravedigger')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alert')).toBeInTheDocument();
  });

  it('treats a 200 null response as not-found instead of an empty editable form (VEG-317)', async () => {
    mockApiFetch.mockResolvedValue(null);

    renderPage();

    expect(await screen.findByText('Failed to load background.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('denies editing SRD backgrounds', async () => {
    mockApiFetch.mockResolvedValue({
      ...ownBackground,
      contentSource: 'srd',
      createdById: null,
    });

    renderPage();

    expect(await screen.findByText(/only edit your own homebrew backgrounds/)).toBeInTheDocument();
  });

  it("denies editing another user's homebrew", async () => {
    mockApiFetch.mockResolvedValue({ ...ownBackground, createdById: 'someone-else' });

    renderPage();

    expect(await screen.findByText(/only edit your own homebrew backgrounds/)).toBeInTheDocument();
  });

  it('lets an admin edit a shared background', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: true,
      isLoading: false,
      user: { userId: 'admin-1' },
    });
    mockApiFetch.mockResolvedValue({
      ...ownBackground,
      contentSource: 'shared',
      createdById: 'other-admin',
    });

    renderPage();

    expect(await screen.findByDisplayValue('Gravedigger')).toBeInTheDocument();
  });

  it('PATCHes the edited fields and redirects to the list', async () => {
    const user = userEvent.setup();

    renderPage();
    await screen.findByDisplayValue('Gravedigger');

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Exhumer' } });
    mockApiFetch.mockResolvedValue({ ...ownBackground, name: 'Exhumer' });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/srd/backgrounds/bg-hb',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
    const patchCall = mockApiFetch.mock.calls.find(c => c[1]?.method === 'PATCH');
    expect(JSON.parse(patchCall![1].body)).toEqual(
      expect.objectContaining({ name: 'Exhumer', originFeatId: 'feat-alert' })
    );
    expect(toast.success).toHaveBeenCalledWith('Background updated');
    expect(mockPush).toHaveBeenCalledWith('/srd/backgrounds');
  });

  it('toasts the API error message and stays on the page', async () => {
    const user = userEvent.setup();

    renderPage();
    await screen.findByDisplayValue('Gravedigger');

    mockApiFetch.mockRejectedValue(new Error('Origin feat not found or not accessible'));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Origin feat not found or not accessible');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('offers a retry after a failed load', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network down'));

    renderPage();

    expect(await screen.findByText('Failed to load background.')).toBeInTheDocument();

    mockApiFetch.mockResolvedValue(ownBackground);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByDisplayValue('Gravedigger')).toBeInTheDocument();
  });

  it('invalidates the cached background lists after a save', async () => {
    const user = userEvent.setup();

    renderPage();
    await screen.findByDisplayValue('Gravedigger');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/srd/backgrounds'));
    expect(invalidateApiPath).toHaveBeenCalledWith(expect.anything(), '/srd/backgrounds');
  });

  it('keeps Save disabled after a successful save so a second click cannot re-PATCH', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(ownBackground);

    renderPage();
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/srd/backgrounds'));

    const save = screen.getByRole('button', { name: 'Saving...' });
    expect(save).toBeDisabled();
    await user.click(save);
    expect(mockApiFetch.mock.calls.filter(c => c[1]?.method === 'PATCH')).toHaveLength(1);
  });

  it('shows the loading state, not the error, while a retry is in flight', async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockRejectedValueOnce(new Error('network'))
      .mockReturnValueOnce(new Promise(() => {}));

    renderPage();
    await user.click(await screen.findByRole('button', { name: /retry/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the loading state while a retry after a null response is in flight', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(null).mockReturnValueOnce(new Promise(() => {}));

    renderPage();
    await user.click(await screen.findByRole('button', { name: /retry/i }));

    expect(await screen.findByRole('status')).toHaveTextContent('Loading…');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
