import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NpcDetailPage from '../page';
import type { Npc } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockApiFetch = vi.fn();
const mockPush = vi.fn();
const mockConfirm = vi.fn();
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
  mockConfirm.mockReset();
  vi.spyOn(window, 'confirm').mockImplementation(mockConfirm);
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

  it('reroll-all confirms when fields are locked', async () => {
    const user = userEvent.setup();
    mockConfirm.mockReturnValue(false);
    mockApiFetch.mockResolvedValueOnce(makeNpc({ lockedFields: ['name'] }));
    render(<NpcDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /reroll all/i }));
    expect(mockConfirm).toHaveBeenCalled();
    // Should not have made the reroll call since user cancelled
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
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
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/npcs/npc-1/reroll',
      expect.objectContaining({ body: JSON.stringify({ field: 'all' }) })
    );
  });

  it('deletes the NPC and redirects to list', async () => {
    const user = userEvent.setup();
    mockConfirm.mockReturnValue(true);
    mockApiFetch.mockResolvedValueOnce(makeNpc());
    mockApiFetch.mockResolvedValueOnce(undefined);
    render(<NpcDetailPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Old Maelin' })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/npcs/npc-1',
      expect.objectContaining({ method: 'DELETE' })
    );
    expect(mockPush).toHaveBeenCalledWith('/campaigns/campaign-1/npcs');
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

    it('Remove Stat Block PATCHes statBlock: null after confirmation', async () => {
      const user = userEvent.setup();
      mockConfirm.mockReturnValue(true);
      mockApiFetch.mockResolvedValueOnce(makeNpc({ statBlock: SAMPLE_STAT_BLOCK }));
      mockApiFetch.mockResolvedValueOnce(makeNpc({ statBlock: null }));
      render(<NpcDetailPage />);
      await waitFor(() => expect(screen.getByTestId('npc-stat-block')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /remove stat block/i }));
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/npcs/npc-1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ statBlock: null }),
        })
      );
    });

    it('Remove Stat Block skips API call when the user cancels confirmation', async () => {
      const user = userEvent.setup();
      mockConfirm.mockReturnValue(false);
      mockApiFetch.mockResolvedValueOnce(makeNpc({ statBlock: SAMPLE_STAT_BLOCK }));
      render(<NpcDetailPage />);
      await waitFor(() => expect(screen.getByTestId('npc-stat-block')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /remove stat block/i }));
      expect(mockConfirm).toHaveBeenCalled();
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
    });
  });
});
