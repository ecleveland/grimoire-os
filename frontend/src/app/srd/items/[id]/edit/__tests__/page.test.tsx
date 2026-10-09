import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import EditItemPage from '../page';
import type { SrdItem } from '@/lib/types';

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
  useParams: () => ({ id: 'hb-1' }),
}));

const ownItem: SrdItem = {
  id: 'hb-1',
  name: 'Lucky Coin',
  category: 'Wondrous Item',
  rarity: 'Uncommon',
  properties: ['Shiny'],
  description: 'A coin that always lands on edge.',
  requiresAttunement: false,
  isMagic: true,
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<EditItemPage />, { wrapper }) };
}

describe('EditItemPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: false,
      user: { userId: 'u1' },
    });
  });

  it('waits for auth hydration before judging edit rights (no false denial mid-hydration)', async () => {
    // Pre-hydration the provider reports user:null / isAdmin:false / isLoading:true.
    // The owner's item can load before auth settles; canEdit must not be evaluated
    // against the null user, or a legitimate owner gets the denial screen (VEG-320).
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      user: null,
      isLoading: true,
    });
    mockApiFetch.mockResolvedValue(ownItem);

    renderPage();

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByText(/only edit your own homebrew/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('loads the item and prefills the form', async () => {
    mockApiFetch.mockResolvedValue(ownItem);

    renderPage();

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Lucky Coin');
    expect(mockApiFetch).toHaveBeenCalledWith('/srd/items/hb-1');
  });

  it('shows a retry screen instead of an editable form when the load fails (VEG-317)', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(ownItem);
    const user = userEvent.setup();

    renderPage();

    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();

    await user.click(retry);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Lucky Coin');
  });

  it('treats a null response (invisible/missing item) as a failed load', async () => {
    mockApiFetch.mockResolvedValue(null);

    renderPage();

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('refuses to edit catalog content the caller cannot modify', async () => {
    mockApiFetch.mockResolvedValue({
      ...ownItem,
      contentSource: 'srd',
      createdById: null,
      source: 'SRD 5.2.1',
    });

    renderPage();

    expect(await screen.findByText(/only edit your own homebrew/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('lets an admin edit shared content', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: true,
      user: { userId: 'a1' },
    });
    mockApiFetch.mockResolvedValue({ ...ownItem, contentSource: 'shared', createdById: 'u1' });

    renderPage();

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Lucky Coin');
  });

  it('PATCHes the edited item and redirects', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(ownItem).mockResolvedValueOnce({ ...ownItem });

    renderPage();
    const name = await screen.findByLabelText(/^Name/);
    fireEvent.change(name, { target: { value: 'Luckier Coin' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/srd/items/hb-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
    const body = JSON.parse(mockApiFetch.mock.calls[1][1].body);
    expect(body).toEqual(expect.objectContaining({ name: 'Luckier Coin' }));
    expect(toast.success).toHaveBeenCalledWith('Item updated');
    expect(mockPush).toHaveBeenCalledWith('/srd/items');
  });

  it('toasts the API error and stays when the save fails', async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(ownItem)
      .mockRejectedValueOnce(new Error('You already have an item with this name'));

    renderPage();
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('You already have an item with this name');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error save rejections', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(ownItem).mockRejectedValueOnce('boom');

    renderPage();
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update item');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('invalidates the cached item lists after a save', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(ownItem);

    const { client } = renderPage();
    client.setQueryData(['api', '/srd/items?page=1'], { data: [], total: 0 });
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/srd/items'));
    expect(client.getQueryState(['api', '/srd/items?page=1'])?.isInvalidated).toBe(true);
  });

  it('keeps Save disabled after a successful save so a second click cannot re-PATCH', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValue(ownItem);

    renderPage();
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/srd/items'));

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
