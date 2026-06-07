import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import MonsterListPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
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

function renderPage() {
  return render(
    <PrintTrayProvider>
      <MonsterListPage />
    </PrintTrayProvider>
  );
}

/** The persisted tray contents, for asserting tray state after a toggle. */
function storedTray(): unknown {
  return JSON.parse(localStorage.getItem(PRINT_TRAY_STORAGE_KEY) ?? '[]');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MonsterListPage', () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(makeResponse([goblin, dragon]));
  });

  describe('rendering', () => {
    it('renders the heading "Monsters"', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /^Monsters$/i })).toBeInTheDocument();
      });
    });

    it('renders monster names after load', async () => {
      renderPage();
      await waitFor(() => {
        expect(screen.getByText('Goblin')).toBeInTheDocument();
        expect(screen.getByText('Ancient Red Dragon')).toBeInTheDocument();
      });
    });

    it('renders the search input', async () => {
      renderPage();
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

      renderPage();
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
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Goblin/i }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith('/srd/monsters/monster-1');
      });
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(await screen.findByText('Nimble Escape.')).toBeInTheDocument();
    });

    it('closes the modal on Escape', async () => {
      routeApi();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Goblin/i }));
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
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Goblin/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('print set selection', () => {
    it('toggles a monster into the tray from its list card', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Add Goblin to print set' }));

      expect(storedTray()).toEqual([{ type: 'monster', id: 'monster-1' }]);
      expect(screen.getByRole('button', { name: 'Remove Goblin from print set' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    });

    it('toggling the card affordance does not open the detail modal', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Add Goblin to print set' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // Only the list fetch ran — no detail fetch was triggered.
      expect(mockApiFetch).not.toHaveBeenCalledWith('/srd/monsters/monster-1');
    });

    it('removes a selected monster from the tray on second click', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Add Goblin to print set' }));
      await user.click(screen.getByRole('button', { name: 'Remove Goblin from print set' }));

      expect(storedTray()).toEqual([]);
    });

    it('toggles the monster from inside the detail modal', async () => {
      mockApiFetch.mockImplementation((path: string) => {
        if (path.startsWith('/srd/monsters/')) return Promise.resolve(goblin);
        return Promise.resolve(makeResponse([goblin, dragon]));
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Goblin/i }));
      const dialog = await screen.findByRole('dialog');

      await user.click(within(dialog).getByRole('button', { name: 'Add Goblin to print set' }));

      expect(storedTray()).toEqual([{ type: 'monster', id: 'monster-1' }]);
      expect(
        within(dialog).getByRole('button', { name: 'Remove Goblin from print set' })
      ).toHaveTextContent('Remove from print set');
    });

    it('reflects the modal toggle on the same monster’s list card simultaneously', async () => {
      mockApiFetch.mockImplementation((path: string) => {
        if (path.startsWith('/srd/monsters/')) return Promise.resolve(goblin);
        return Promise.resolve(makeResponse([goblin, dragon]));
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Goblin/i }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Add Goblin to print set' }));

      // The card and modal toggle the same (type, id); the list card affordance
      // outside the dialog must reflect the selection the modal just made.
      const cardToggle = screen
        .getAllByRole('button', { name: 'Remove Goblin from print set' })
        .find(button => button.closest('[role="dialog"]') === null);
      expect(cardToggle).toBeDefined();
      expect(cardToggle).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
