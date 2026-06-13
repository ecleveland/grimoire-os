import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

    render(<EditItemPage />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByText(/only edit your own homebrew/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('loads the item and prefills the form', async () => {
    mockApiFetch.mockResolvedValue(ownItem);

    render(<EditItemPage />);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Lucky Coin');
    expect(mockApiFetch).toHaveBeenCalledWith('/srd/items/hb-1');
  });

  it('shows a retry screen instead of an editable form when the load fails (VEG-317)', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(ownItem);
    const user = userEvent.setup();

    render(<EditItemPage />);

    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();

    await user.click(retry);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Lucky Coin');
  });

  it('treats a null response (invisible/missing item) as a failed load', async () => {
    mockApiFetch.mockResolvedValue(null);

    render(<EditItemPage />);

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

    render(<EditItemPage />);

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

    render(<EditItemPage />);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Lucky Coin');
  });

  it('PATCHes the edited item and redirects', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(ownItem).mockResolvedValueOnce({ ...ownItem });

    render(<EditItemPage />);
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

    render(<EditItemPage />);
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

    render(<EditItemPage />);
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update item');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
