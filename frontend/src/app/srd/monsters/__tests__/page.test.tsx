import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import MonsterListPage from '../page';
import type { SrdMonster, PaginatedResponse } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/components/Pagination', () => ({
  default: () => <div data-testid="pagination" />,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const goblin: SrdMonster = {
  id: 'monster-1',
  name: 'Goblin',
  size: 'Small',
  type: 'Humanoid',
  alignment: 'Neutral Evil',
  armorClass: 15,
  hitPoints: 7,
  speed: '30 ft.',
  str: 8,
  dex: 14,
  con: 10,
  int: 10,
  wis: 8,
  cha: 8,
  damageResistances: [],
  damageImmunities: [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  challengeRating: 0.25,
  actions: [],
  source: 'SRD 5.2.1',
};

const dragon: SrdMonster = {
  id: 'monster-2',
  name: 'Ancient Red Dragon',
  size: 'Gargantuan',
  type: 'Dragon',
  alignment: 'Chaotic Evil',
  armorClass: 22,
  hitPoints: 546,
  speed: '40 ft.',
  str: 30,
  dex: 10,
  con: 29,
  int: 18,
  wis: 15,
  cha: 23,
  damageResistances: [],
  damageImmunities: ['fire'],
  damageVulnerabilities: [],
  conditionImmunities: [],
  challengeRating: 24,
  actions: [],
  source: 'SRD 5.2.1',
};

function makeResponse(monsters: SrdMonster[]): PaginatedResponse<SrdMonster> {
  return {
    data: monsters,
    total: monsters.length,
    page: 1,
    lastPage: 1,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MonsterListPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(makeResponse([goblin, dragon]));
  });

  describe('rendering', () => {
    it('renders the heading "Monsters"', async () => {
      render(<MonsterListPage />);
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^Monsters$/i })).toBeInTheDocument();
      });
    });

    it('renders monster names after load', async () => {
      render(<MonsterListPage />);
      await waitFor(() => {
        expect(screen.getByText('Goblin')).toBeInTheDocument();
        expect(screen.getByText('Ancient Red Dragon')).toBeInTheDocument();
      });
    });

    it('renders the search input', async () => {
      render(<MonsterListPage />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search monsters...')).toBeInTheDocument();
      });
    });
  });

  describe('focus preservation across debounced refetch', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    async function setupWithPendingRefetch(initial: SrdMonster[]) {
      mockApiFetch.mockResolvedValueOnce(makeResponse(initial));

      let resolveRefetch!: (v: PaginatedResponse<SrdMonster>) => void;
      mockApiFetch.mockImplementationOnce(
        () =>
          new Promise<PaginatedResponse<SrdMonster>>(resolve => {
            resolveRefetch = resolve;
          })
      );

      render(<MonsterListPage />);
      // Wait for the initial fetch to settle and the input to mount.
      const input = await screen.findByPlaceholderText('Search monsters...');

      // Switch to fake timers AFTER initial load so RTL findBy* polling isn't frozen.
      vi.useFakeTimers();

      return { input, resolveRefetch: () => resolveRefetch(makeResponse([goblin])) };
    }

    it('keeps the search input mounted while a refetch is in flight', async () => {
      const { input, resolveRefetch } = await setupWithPendingRefetch([goblin, dragon]);

      input.focus();
      fireEvent.change(input, { target: { value: 'g' } });

      // Advance past the 300ms debounce -> triggers the (pending) refetch.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      // Bug: `if (loading) return ...` unmounts the entire UI, including the input.
      // Fix: keep the search input mounted; only the results region toggles.
      expect(screen.getByPlaceholderText('Search monsters...')).toBe(input);
      expect(document.activeElement).toBe(input);

      // Drain the pending refetch so React's effects don't leak between tests.
      await act(async () => {
        resolveRefetch();
        await vi.runAllTimersAsync();
      });
    });

    it('keeps the search input mounted when refetch is triggered with no current results', async () => {
      // Edge case that bites the `loading && items.length === 0` guard pattern too:
      // when the previous result was empty, the guard re-fires and unmounts the input.
      const { input, resolveRefetch } = await setupWithPendingRefetch([]);

      input.focus();
      fireEvent.change(input, { target: { value: 'x' } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      expect(screen.getByPlaceholderText('Search monsters...')).toBe(input);
      expect(document.activeElement).toBe(input);

      await act(async () => {
        resolveRefetch();
        await vi.runAllTimersAsync();
      });
    });
  });

  describe('monster stat block modal', () => {
    const goblinDetail: SrdMonster = {
      ...goblin,
      specialAbilities: [{ name: 'Nimble Escape', description: 'Disengage as a bonus action.' }],
      actions: [{ name: 'Scimitar', description: 'Melee: +4 to hit, 1d6+2 slashing.' }],
    };

    function routeApi(
      detail: (path: string) => Promise<unknown> = () => Promise.resolve(goblinDetail)
    ) {
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation((path: string) => {
        if (path.startsWith('/srd/monsters/')) return detail(path);
        return Promise.resolve(makeResponse([goblin, dragon]));
      });
    }

    it('fetches and opens the stat block when a monster card is clicked', async () => {
      routeApi();
      const user = userEvent.setup();
      render(<MonsterListPage />);

      await user.click(await screen.findByRole('button', { name: /Goblin/i }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/srd/monsters/monster-1');
      });
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(await screen.findByText('Nimble Escape.')).toBeInTheDocument();
    });

    it('closes the modal on Escape', async () => {
      routeApi();
      const user = userEvent.setup();
      render(<MonsterListPage />);

      await user.click(await screen.findByRole('button', { name: /Goblin/i }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();

      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
    });

    it('shows an error toast and no modal when the detail fetch fails', async () => {
      vi.mocked(toast.error).mockClear();
      routeApi(() => Promise.reject(new Error('boom')));
      const user = userEvent.setup();
      render(<MonsterListPage />);

      await user.click(await screen.findByRole('button', { name: /Goblin/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
