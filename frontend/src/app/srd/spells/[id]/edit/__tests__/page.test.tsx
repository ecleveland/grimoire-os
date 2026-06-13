import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import EditSpellPage from '../page';
import type { SrdSpell } from '@/lib/types';

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

const ownSpell: SrdSpell = {
  id: 'hb-1',
  name: 'Soul Bonfire',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  description: 'A bright streak flashes.',
  classes: ['Sorcerer'],
  ritual: false,
  concentration: true,
  material: 'A tiny ball of bat guano',
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

describe('EditSpellPage', () => {
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
    // The owner's spell can load before auth settles; canEdit must not be evaluated
    // against the null user, or a legitimate owner gets the denial screen (VEG-320).
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      user: null,
      isLoading: true,
    });
    mockApiFetch.mockResolvedValue(ownSpell);

    render(<EditSpellPage />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByText(/only edit your own homebrew/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('loads the spell and prefills the form', async () => {
    mockApiFetch.mockResolvedValue(ownSpell);

    render(<EditSpellPage />);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Soul Bonfire');
    expect(mockApiFetch).toHaveBeenCalledWith('/srd/spells/hb-1');
  });

  it('shows a retry screen instead of an editable form when the load fails (VEG-317)', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(ownSpell);
    const user = userEvent.setup();

    render(<EditSpellPage />);

    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();

    await user.click(retry);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Soul Bonfire');
  });

  it('treats a null response (invisible/missing spell) as a failed load', async () => {
    mockApiFetch.mockResolvedValue(null);

    render(<EditSpellPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('refuses to edit catalog content the caller cannot modify', async () => {
    mockApiFetch.mockResolvedValue({
      ...ownSpell,
      contentSource: 'srd',
      createdById: null,
      source: 'SRD 5.2.1',
    });

    render(<EditSpellPage />);

    expect(await screen.findByText(/only edit your own homebrew/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('lets an admin edit shared content', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: true,
      user: { userId: 'a1' },
    });
    mockApiFetch.mockResolvedValue({ ...ownSpell, contentSource: 'shared', createdById: 'u1' });

    render(<EditSpellPage />);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Soul Bonfire');
  });

  it('PATCHes the edited spell and redirects', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(ownSpell).mockResolvedValueOnce({ ...ownSpell });

    render(<EditSpellPage />);
    const name = await screen.findByLabelText(/^Name/);
    fireEvent.change(name, { target: { value: 'Ember Storm' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/srd/spells/hb-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
    const body = JSON.parse(mockApiFetch.mock.calls[1][1].body);
    expect(body).toEqual(expect.objectContaining({ name: 'Ember Storm' }));
    expect(toast.success).toHaveBeenCalledWith('Spell updated');
    expect(mockPush).toHaveBeenCalledWith('/srd/spells');
  });

  it('toasts the API error and stays when the save fails', async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(ownSpell)
      .mockRejectedValueOnce(new Error('You already have a spell with this name'));

    render(<EditSpellPage />);
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('You already have a spell with this name');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
