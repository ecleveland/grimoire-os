import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import NpcsListPage from '../page';
import type { Npc, PaginatedResponse } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'campaign-1' }),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeNpc(over: Partial<Npc> = {}): Npc {
  return {
    id: 'npc-1',
    campaignId: 'campaign-1',
    createdById: 'user-1',
    name: 'Old Maelin',
    race: 'Human',
    background: null,
    profession: 'Peasant',
    alignment: 'Neutral Good',
    size: null,
    age: null,
    gender: null,
    appearance: null,
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    statBlock: null,
    goldPieces: 0,
    silverPieces: 0,
    copperPieces: 0,
    loot: null,
    lootOverrides: null,
    generationParams: null,
    lockedFields: [],
    isManual: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeResponse(data: Npc[]): PaginatedResponse<Npc> {
  return { data, total: data.length, page: 1, lastPage: 1, limit: 20 };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockUseAuth.mockReset();
  mockUseAuth.mockReturnValue({
    user: { userId: 'user-1', role: 'dungeon_master' },
    isDm: true,
  });
});

describe('NpcsListPage', () => {
  it('fetches NPCs for the campaign on mount', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    render(<NpcsListPage />);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/npcs?campaignId=campaign-1')
      );
    });
  });

  it('renders the heading and "New NPC" link', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    render(<NpcsListPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: /npcs/i })).toBeInTheDocument();
    const newLink = screen.getByRole('link', { name: /new npc/i });
    expect(newLink).toHaveAttribute('href', '/campaigns/campaign-1/npcs/new');
  });

  it('renders NPC cards with name, race, profession, link to detail', async () => {
    mockApiFetch.mockResolvedValue(
      makeResponse([
        makeNpc({ id: 'a', name: 'Old Maelin', race: 'Human', profession: 'Peasant' }),
        makeNpc({ id: 'b', name: 'Borin', race: 'Dwarf', profession: 'Blacksmith' }),
      ])
    );
    render(<NpcsListPage />);
    await waitFor(() => expect(screen.getByText('Old Maelin')).toBeInTheDocument());
    expect(screen.getByText('Borin')).toBeInTheDocument();
    // Race + profession appear under each NPC card alongside the dropdown options.
    // Filter by content with explicit separator to avoid the dropdown options.
    expect(screen.getByText('Human · Peasant')).toBeInTheDocument();
    expect(screen.getByText('Dwarf · Blacksmith')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /old maelin/i });
    expect(link).toHaveAttribute('href', '/campaigns/campaign-1/npcs/a');
  });

  it('shows empty state when no NPCs', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    render(<NpcsListPage />);
    await waitFor(() => expect(screen.getByText(/no npcs yet/i)).toBeInTheDocument());
  });

  describe('bulk loot reroll', () => {
    const twoNpcs = () => [
      makeNpc({ id: 'a', name: 'Old Maelin' }),
      makeNpc({ id: 'b', name: 'Borin' }),
    ];

    it('lets a DM select NPCs and bulk-reroll their loot via the existing endpoint', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockImplementation((url: string) => {
        if (url.startsWith('/npcs?')) return Promise.resolve(makeResponse(twoNpcs()));
        return Promise.resolve(makeNpc());
      });
      render(<NpcsListPage />);
      await waitFor(() => expect(screen.getByText('Old Maelin')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /reroll loot/i })).not.toBeInTheDocument();

      await user.click(screen.getByRole('checkbox', { name: /select old maelin/i }));
      await user.click(screen.getByRole('checkbox', { name: /select borin/i }));
      await user.click(screen.getByRole('button', { name: /reroll loot \(2\)/i }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Rerolled loot for 2 NPCs'));
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/npcs/a/reroll',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ field: 'loot' }) })
      );
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/npcs/b/reroll',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ field: 'loot' }) })
      );
      // Selection is cleared after a fully successful run.
      expect(screen.queryByRole('button', { name: /reroll loot/i })).not.toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /select old maelin/i })).not.toBeChecked();
    });

    it('toasts the failure count and keeps failed NPCs selected on partial failure', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockImplementation((url: string) => {
        if (url.startsWith('/npcs?')) return Promise.resolve(makeResponse(twoNpcs()));
        if (url === '/npcs/b/reroll') return Promise.reject(new Error('manual NPC'));
        return Promise.resolve(makeNpc());
      });
      render(<NpcsListPage />);
      await waitFor(() => expect(screen.getByText('Old Maelin')).toBeInTheDocument());

      await user.click(screen.getByRole('checkbox', { name: /select old maelin/i }));
      await user.click(screen.getByRole('checkbox', { name: /select borin/i }));
      await user.click(screen.getByRole('button', { name: /reroll loot \(2\)/i }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith('Failed to reroll loot for 1 of 2 NPCs')
      );
      // The failed NPC stays selected for a retry.
      expect(screen.getByRole('button', { name: /reroll loot \(1\)/i })).toBeInTheDocument();
      expect(screen.getByRole('checkbox', { name: /select borin/i })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /select old maelin/i })).not.toBeChecked();
    });

    it('hides selection checkboxes and the bulk button for users who are neither DM nor creator', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'user-2', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(makeResponse(twoNpcs()));
      render(<NpcsListPage />);
      await waitFor(() => expect(screen.getByText('Old Maelin')).toBeInTheDocument());
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reroll loot/i })).not.toBeInTheDocument();
    });

    it('shows selection checkboxes to the NPC creator even without the DM role', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'user-1', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(makeResponse(twoNpcs()));
      render(<NpcsListPage />);
      await waitFor(() => expect(screen.getByText('Old Maelin')).toBeInTheDocument());
      expect(screen.getByRole('checkbox', { name: /select old maelin/i })).toBeInTheDocument();
    });

    it('clears the selection when filters change', async () => {
      const user = userEvent.setup();
      mockApiFetch.mockResolvedValue(makeResponse(twoNpcs()));
      render(<NpcsListPage />);
      await waitFor(() => expect(screen.getByText('Old Maelin')).toBeInTheDocument());

      await user.click(screen.getByRole('checkbox', { name: /select old maelin/i }));
      expect(screen.getByRole('button', { name: /reroll loot \(1\)/i })).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText(/race/i), 'Elf');
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: /reroll loot/i })).not.toBeInTheDocument()
      );
    });
  });

  it('refetches with race filter when changed', async () => {
    mockApiFetch.mockResolvedValue(makeResponse([]));
    const user = userEvent.setup();
    render(<NpcsListPage />);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue(makeResponse([]));
    await user.selectOptions(screen.getByLabelText(/race/i), 'Elf');
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('race=Elf'));
    });
  });
});
