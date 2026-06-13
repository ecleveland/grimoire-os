import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import EditFeatPage from '../page';
import type { SrdFeat } from '@/lib/types';

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

const ownFeat: SrdFeat = {
  id: 'hb-1',
  name: 'Lucky Dodge',
  description: 'You twist away from danger.',
  prerequisite: 'Dex 13+',
  benefits: ['Once per rest, impose disadvantage on an attack against you.'],
  category: 'General',
  repeatable: false,
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

describe('EditFeatPage', () => {
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
    // The owner's feat can load before auth settles; canEdit must not be evaluated
    // against the null user, or a legitimate owner gets the denial screen (VEG-320).
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      user: null,
      isLoading: true,
    });
    mockApiFetch.mockResolvedValue(ownFeat);

    render(<EditFeatPage />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByText(/only edit your own homebrew/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('loads the feat and prefills the form', async () => {
    mockApiFetch.mockResolvedValue(ownFeat);

    render(<EditFeatPage />);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Lucky Dodge');
    expect(mockApiFetch).toHaveBeenCalledWith('/srd/feats/hb-1');
  });

  it('shows a retry screen instead of an editable form when the load fails (VEG-317)', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(ownFeat);
    const user = userEvent.setup();

    render(<EditFeatPage />);

    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();

    await user.click(retry);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Lucky Dodge');
  });

  it('treats a null response (invisible/missing feat) as a failed load', async () => {
    mockApiFetch.mockResolvedValue(null);

    render(<EditFeatPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('refuses to edit catalog content the caller cannot modify', async () => {
    mockApiFetch.mockResolvedValue({
      ...ownFeat,
      contentSource: 'srd',
      createdById: null,
      source: 'SRD 5.2.1',
    });

    render(<EditFeatPage />);

    expect(await screen.findByText(/only edit your own homebrew/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('lets an admin edit shared content', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: true,
      user: { userId: 'a1' },
    });
    mockApiFetch.mockResolvedValue({ ...ownFeat, contentSource: 'shared', createdById: 'u1' });

    render(<EditFeatPage />);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Lucky Dodge');
  });

  it('PATCHes the edited feat and redirects', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(ownFeat).mockResolvedValueOnce({ ...ownFeat });

    render(<EditFeatPage />);
    const name = await screen.findByLabelText(/^Name/);
    fireEvent.change(name, { target: { value: 'Uncanny Dodge' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/srd/feats/hb-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
    const body = JSON.parse(mockApiFetch.mock.calls[1][1].body);
    expect(body).toEqual(expect.objectContaining({ name: 'Uncanny Dodge' }));
    expect(toast.success).toHaveBeenCalledWith('Feat updated');
    expect(mockPush).toHaveBeenCalledWith('/srd/feats');
  });

  it('toasts the API error and stays when the save fails', async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(ownFeat)
      .mockRejectedValueOnce(new Error('You already have a feat with this name'));

    render(<EditFeatPage />);
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('You already have a feat with this name');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('falls back to a generic message for non-Error save rejections', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(ownFeat).mockRejectedValueOnce('boom');

    render(<EditFeatPage />);
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to update feat');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
