import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import NpcDetailPage from '../page';
import type { Npc } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockApiFetch = vi.fn();
const mockPush = vi.fn();
const mockUseAuth = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'campaign-1', npcId: 'npc-1' }),
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

function makeNpc(over: Partial<Npc> = {}): Npc {
  return {
    id: 'npc-1',
    campaignId: 'campaign-1',
    createdById: 'user-1',
    name: 'Old Maelin',
    race: 'Human',
    background: 'Folk Hero',
    profession: 'Peasant',
    alignment: 'Neutral Good',
    size: 'Medium',
    age: 42,
    gender: 'male',
    appearance: 'Worn boots, kind eyes.',
    personalityTraits: ['Friendly'],
    ideals: ['Honesty'],
    bonds: ['Loves the village'],
    flaws: ['Stubborn'],
    statBlock: null,
    goldPieces: 1,
    silverPieces: 5,
    copperPieces: 12,
    loot: [],
    lootOverrides: null,
    generationParams: null,
    lockedFields: [],
    isManual: false,
    outgoingLinks: [],
    incomingLinks: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockPush.mockReset();
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({
    user: { userId: 'user-1', role: 'dungeon_master' },
    isDm: true,
  });
});

describe('NpcDetailPage', () => {
  it('fetches and renders the NPC', async () => {
    mockApiFetch.mockResolvedValue(makeNpc());
    render(<NpcDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
    );
    expect(mockApiFetch).toHaveBeenCalledWith('/npcs/npc-1');
    expect(screen.getByText('Folk Hero')).toBeInTheDocument();
    expect(screen.getByText('Peasant')).toBeInTheDocument();
  });

  it('rerolls a single field on dice click', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(makeNpc({ alignment: 'Lawful Good' }));
    mockApiFetch.mockResolvedValueOnce(makeNpc({ alignment: 'Chaotic Good' }));
    render(<NpcDetailPage />);
    await waitFor(() => expect(screen.getByText('Lawful Good')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /reroll alignment/i }));
    await waitFor(() => expect(screen.getByText('Chaotic Good')).toBeInTheDocument());
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/npcs/npc-1/reroll',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ field: 'alignment' }),
      })
    );
  });

  it('toggles lock via PATCH /npcs/:id', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(makeNpc({ lockedFields: [] }));
    mockApiFetch.mockResolvedValueOnce(makeNpc({ lockedFields: ['alignment'] }));
    render(<NpcDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /lock alignment/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/npcs/npc-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ lockedFields: ['alignment'] }),
      })
    );
  });

  it('reroll-all opens a confirm dialog when fields are locked and cancels safely', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(makeNpc({ lockedFields: ['name'] }));
    render(<NpcDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /reroll all/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/1 field\(s\) are locked/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Should not have made the reroll call since user cancelled
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('reroll-all proceeds with reroll when the locked-fields confirm is accepted', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(makeNpc({ lockedFields: ['name'] }));
    mockApiFetch.mockResolvedValueOnce(makeNpc({ name: 'Old Maelin', lockedFields: ['name'] }));
    render(<NpcDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /reroll all/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /continue/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/npcs/npc-1/reroll',
      expect.objectContaining({ body: JSON.stringify({ field: 'all' }) })
    );
  });

  it('reroll-all skips confirmation when no fields are locked', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(makeNpc({ lockedFields: [] }));
    mockApiFetch.mockResolvedValueOnce(makeNpc({ name: 'Borin' }));
    render(<NpcDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /reroll all/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/npcs/npc-1/reroll',
      expect.objectContaining({ body: JSON.stringify({ field: 'all' }) })
    );
  });

  it('deletes the NPC after confirming and redirects to list', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(makeNpc());
    mockApiFetch.mockResolvedValueOnce(undefined);
    render(<NpcDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/delete "old maelin"/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/npcs/npc-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(mockPush).toHaveBeenCalledWith('/campaigns/campaign-1/npcs');
  });

  it('cancelling the delete confirm leaves the NPC alone', async () => {
    const user = userEvent.setup();
    mockApiFetch.mockResolvedValueOnce(makeNpc());
    render(<NpcDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows edit link', async () => {
    mockApiFetch.mockResolvedValue(makeNpc());
    render(<NpcDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
    );
    const link = screen.getByRole('link', { name: /edit/i });
    expect(link).toHaveAttribute('href', '/campaigns/campaign-1/npcs/npc-1/edit');
  });

  describe('inline loot reroll', () => {
    it('rerolls loot via the Loot card button and updates the displayed loot in place', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce(
        makeNpc({ loot: [{ name: 'Hemp Rope', quantity: 1 }], goldPieces: 1 })
      );
      mockApiFetch.mockResolvedValueOnce(
        makeNpc({ loot: [{ name: 'Ruby Pendant', quantity: 2 }], goldPieces: 7 })
      );
      render(<NpcDetailPage />);
      await waitFor(() => expect(screen.getByText('1× Hemp Rope')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /^reroll loot$/i }));
      await waitFor(() => expect(screen.getByText('2× Ruby Pendant')).toBeInTheDocument());
      expect(screen.queryByText('1× Hemp Rope')).not.toBeInTheDocument();
      expect(screen.getByText(/7 gp/)).toBeInTheDocument();
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/npcs/npc-1/reroll',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ field: 'loot' }),
        })
      );
    });

    it('disables the Reroll Loot button when the loot field is locked', async () => {
      mockApiFetch.mockResolvedValue(makeNpc({ lockedFields: ['loot'] }));
      render(<NpcDetailPage />);
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: /^reroll loot$/i })).toBeDisabled();
    });

    it('hides the Reroll Loot button for users who are neither DM nor the NPC creator', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'user-2', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(makeNpc({ createdById: 'user-1' }));
      render(<NpcDetailPage />);
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
      );
      expect(screen.queryByRole('button', { name: /^reroll loot$/i })).not.toBeInTheDocument();
    });

    it('shows the Reroll Loot button to the NPC creator even without the DM role', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'user-1', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(makeNpc({ createdById: 'user-1' }));
      render(<NpcDetailPage />);
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
      );
      expect(screen.getByRole('button', { name: /^reroll loot$/i })).toBeInTheDocument();
    });

    it('toasts the error message when the reroll fails with an Error', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce(makeNpc());
      mockApiFetch.mockRejectedValueOnce(new Error('Reroll failed badly'));
      render(<NpcDetailPage />);
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /^reroll loot$/i }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Reroll failed badly'));
    });

    it('toasts a generic message when the reroll fails with a non-Error', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce(makeNpc());
      mockApiFetch.mockRejectedValueOnce('nope');
      render(<NpcDetailPage />);
      await waitFor(() =>
        expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /^reroll loot$/i }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to reroll'));
    });
  });

  describe('stat block', () => {
    const SAMPLE_STAT_BLOCK = {
      baseMonster: 'Guard',
      name: 'Old Maelin',
      size: 'Medium',
      type: 'humanoid',
      alignment: 'Neutral Good',
      armorClass: 16,
      hitPoints: 11,
      speed: '30 ft.',
      str: 13,
      dex: 12,
      con: 12,
      int: 10,
      wis: 11,
      cha: 10,
      challengeRating: 0.125,
      actions: [{ name: 'Spear', description: 'Hit: 4 piercing damage.' }],
    };

    it('shows Generate Stat Block button when none is present', async () => {
      mockApiFetch.mockResolvedValue(makeNpc({ statBlock: null }));
      render(<NpcDetailPage />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /generate stat block/i })).toBeInTheDocument()
      );
      expect(screen.queryByTestId('npc-stat-block')).not.toBeInTheDocument();
    });

    it('clicking Generate Stat Block POSTs reroll with field=statBlock', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce(makeNpc({ statBlock: null }));
      mockApiFetch.mockResolvedValueOnce(makeNpc({ statBlock: SAMPLE_STAT_BLOCK }));
      render(<NpcDetailPage />);
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /generate stat block/i })).toBeInTheDocument()
      );
      await user.click(screen.getByRole('button', { name: /generate stat block/i }));
      await waitFor(() => expect(screen.getByTestId('npc-stat-block')).toBeInTheDocument());
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/npcs/npc-1/reroll',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ field: 'statBlock' }),
        })
      );
    });

    it('renders the stat block card and a Remove button when present', async () => {
      mockApiFetch.mockResolvedValue(makeNpc({ statBlock: SAMPLE_STAT_BLOCK }));
      render(<NpcDetailPage />);
      await waitFor(() => expect(screen.getByTestId('npc-stat-block')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: /remove stat block/i })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /generate stat block/i })
      ).not.toBeInTheDocument();
    });

    it('Remove Stat Block PATCHes statBlock: null after confirming the dialog', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce(makeNpc({ statBlock: SAMPLE_STAT_BLOCK }));
      mockApiFetch.mockResolvedValueOnce(makeNpc({ statBlock: null }));
      render(<NpcDetailPage />);
      await waitFor(() => expect(screen.getByTestId('npc-stat-block')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /remove stat block/i }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /^remove$/i }));
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/npcs/npc-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ statBlock: null }),
        })
      );
    });

    it('Remove Stat Block skips API call when the user cancels the confirm dialog', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValueOnce(makeNpc({ statBlock: SAMPLE_STAT_BLOCK }));
      render(<NpcDetailPage />);
      await waitFor(() => expect(screen.getByTestId('npc-stat-block')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /remove stat block/i }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: /cancel/i }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });
  });
});
