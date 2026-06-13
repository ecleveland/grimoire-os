import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import EditMonsterPage from '../page';
import type { SrdMonster } from '@/lib/types';

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

const ownTroll: SrdMonster = {
  id: 'hb-1',
  name: 'Cave Troll',
  size: 'Large',
  type: 'Giant',
  alignment: 'chaotic evil',
  armorClass: 15,
  hitPoints: 84,
  speed: '30 ft.',
  str: 18,
  dex: 13,
  con: 20,
  int: 7,
  wis: 9,
  cha: 7,
  damageResistances: [],
  damageImmunities: [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  challengeRating: 5,
  actions: [{ name: 'Slam', description: '+7 to hit.' }],
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

describe('EditMonsterPage', () => {
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
    // The owner's monster can load before auth settles; canEdit must not be evaluated
    // against the null user, or a legitimate owner gets the denial screen (VEG-320).
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isAdmin: false,
      user: null,
      isLoading: true,
    });
    mockApiFetch.mockResolvedValue(ownTroll);

    render(<EditMonsterPage />);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByText(/only edit your own homebrew/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('loads the monster and prefills the form', async () => {
    mockApiFetch.mockResolvedValue(ownTroll);

    render(<EditMonsterPage />);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Cave Troll');
    expect(mockApiFetch).toHaveBeenCalledWith('/srd/monsters/hb-1');
  });

  it('shows a retry screen instead of an editable form when the load fails (VEG-317)', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(ownTroll);
    const user = userEvent.setup();

    render(<EditMonsterPage />);

    const retry = await screen.findByRole('button', { name: /retry/i });
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();

    await user.click(retry);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Cave Troll');
  });

  it('treats a null response (invisible/missing monster) as a failed load', async () => {
    mockApiFetch.mockResolvedValue(null);

    render(<EditMonsterPage />);

    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('refuses to edit catalog content the caller cannot modify', async () => {
    mockApiFetch.mockResolvedValue({
      ...ownTroll,
      contentSource: 'srd',
      createdById: null,
      source: 'SRD 5.2.1',
    });

    render(<EditMonsterPage />);

    expect(await screen.findByText(/only edit your own homebrew/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('lets an admin edit shared content', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isAdmin: true,
      user: { userId: 'a1' },
    });
    mockApiFetch.mockResolvedValue({ ...ownTroll, contentSource: 'shared', createdById: 'u1' });

    render(<EditMonsterPage />);

    expect(await screen.findByLabelText(/^Name/)).toHaveValue('Cave Troll');
  });

  it('PATCHes the edited monster and redirects', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(ownTroll).mockResolvedValueOnce({ ...ownTroll });

    render(<EditMonsterPage />);
    const name = await screen.findByLabelText(/^Name/);
    fireEvent.change(name, { target: { value: 'Bridge Troll' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/srd/monsters/hb-1',
        expect.objectContaining({ method: 'PATCH' })
      );
    });
    const body = JSON.parse(mockApiFetch.mock.calls[1][1].body);
    expect(body).toEqual(expect.objectContaining({ name: 'Bridge Troll' }));
    expect(toast.success).toHaveBeenCalledWith('Monster updated');
    expect(mockPush).toHaveBeenCalledWith('/srd/monsters');
  });

  it('toasts the API error and stays when the save fails', async () => {
    const user = userEvent.setup();
    mockApiFetch
      .mockResolvedValueOnce(ownTroll)
      .mockRejectedValueOnce(new Error('You already have a monster with this name'));

    render(<EditMonsterPage />);
    await screen.findByLabelText(/^Name/);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('You already have a monster with this name');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
