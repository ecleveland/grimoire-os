import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import MonsterListPage from '../page';
import { PrintTrayProvider, PRINT_TRAY_STORAGE_KEY } from '@/lib/print-tray-context';
import type { SrdMonster, PaginatedResponse } from '@/lib/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
const mockUseAuth = vi.fn();

// Preserve the real module (notably `ApiError`); only stub `apiFetch`.
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

vi.mock('@/components/Pagination', () => ({
  // Interactive stub: clicking it requests page 2, so tests can exercise the
  // out-of-range page clamp without the real component.
  default: ({ onPageChange }: { onPageChange: (p: number) => void }) => (
    <button data-testid="pagination" onClick={() => onPageChange(2)} />
  ),
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
    mockUseAuth.mockReturnValue({ isDm: false });
    vi.mocked(toast.error).mockClear();
    vi.mocked(toast.success).mockClear();
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

  // ── Add to encounter via campaign/encounter picker (VEG-260) ─────────────────

  describe('add to encounter (DM only)', () => {
    const goblinDetail: SrdMonster = {
      ...goblin,
      specialAbilities: [{ name: 'Nimble Escape', description: 'Disengage as a bonus action.' }],
    };

    function pageOf<T>(data: T[]) {
      return { data, total: data.length, page: 1, lastPage: 1 };
    }

    function routeAddFlow(opts: {
      encounter: { id: string; combatants: unknown[]; version: number };
      onPatch?: (body: unknown) => Promise<unknown>;
    }) {
      const { encounter, onPatch } = opts;
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
        if (path === `/encounters/${encounter.id}` && init?.method === 'PATCH') {
          const body = JSON.parse(init.body ?? '{}');
          return onPatch ? onPatch(body) : Promise.resolve({ ...encounter, ...body });
        }
        if (path === `/encounters/${encounter.id}`) return Promise.resolve(encounter);
        if (path.startsWith('/encounters?')) {
          return Promise.resolve(pageOf([{ id: encounter.id, name: 'Death House' }]));
        }
        if (path.startsWith('/campaigns')) {
          return Promise.resolve(pageOf([{ id: 'camp-1', name: 'Curse of Strahd' }]));
        }
        if (path.startsWith('/srd/monsters/')) return Promise.resolve(goblinDetail);
        return Promise.resolve(makeResponse([goblin, dragon]));
      });
    }

    async function openGoblinModal(user: ReturnType<typeof userEvent.setup>) {
      await user.click(await screen.findByRole('button', { name: /^Goblin/i }));
      await screen.findByText('Nimble Escape.');
    }

    it('hides the "Add to encounter" CTA from non-DMs', async () => {
      mockUseAuth.mockReturnValue({ isDm: false });
      routeAddFlow({ encounter: { id: 'enc-1', combatants: [], version: 2 } });
      const user = userEvent.setup();
      renderPage();
      await openGoblinModal(user);
      expect(screen.queryByRole('button', { name: /add to encounter/i })).not.toBeInTheDocument();
    });

    it('shows the CTA to a DM and walks campaign → encounter → add, PATCHing with the version', async () => {
      mockUseAuth.mockReturnValue({ isDm: true });
      routeAddFlow({
        encounter: {
          id: 'enc-1',
          combatants: [{ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, ac: 16, isNpc: false }],
          version: 2,
        },
      });
      const user = userEvent.setup();
      renderPage();
      await openGoblinModal(user);

      await user.click(screen.getByRole('button', { name: /add to encounter/i })); // CTA -> picker
      await user.selectOptions(await screen.findByLabelText(/campaign/i), 'camp-1');
      await user.selectOptions(await screen.findByLabelText(/encounter/i), 'enc-1');
      await user.click(screen.getByRole('button', { name: /continue/i }));

      // Dialog -> confirm (default quantity 1, initiative 10).
      await user.click(await screen.findByRole('button', { name: /add to encounter/i }));

      let patchBody:
        | { combatants: Array<Record<string, unknown>>; expectedVersion: number }
        | undefined;
      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(
          ([p, o]) =>
            p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
        );
        expect(call).toBeDefined();
        patchBody = JSON.parse((call![1] as { body: string }).body);
      });
      expect(patchBody!.expectedVersion).toBe(2);
      expect(patchBody!.combatants[0].name).toBe('Hero');
      expect(patchBody!.combatants[patchBody!.combatants.length - 1]).toMatchObject({
        name: 'Goblin',
        ac: 15,
        hp: 7,
        maxHp: 7,
        isNpc: true,
        monsterId: 'monster-1',
      });
      await waitFor(() => expect(toast.success).toHaveBeenCalled());
    });

    it('surfaces a 409 conflict from the picker flow without reporting success', async () => {
      const { ApiError } = await import('@/lib/api');
      mockUseAuth.mockReturnValue({ isDm: true });
      routeAddFlow({
        encounter: { id: 'enc-1', combatants: [], version: 2 },
        onPatch: () =>
          Promise.reject(new ApiError(409, 'Encounter was modified by another request.', {})),
      });
      const user = userEvent.setup();
      renderPage();
      await openGoblinModal(user);

      await user.click(screen.getByRole('button', { name: /add to encounter/i }));
      await user.selectOptions(await screen.findByLabelText(/campaign/i), 'camp-1');
      await user.selectOptions(await screen.findByLabelText(/encounter/i), 'enc-1');
      await user.click(screen.getByRole('button', { name: /continue/i }));
      await user.click(await screen.findByRole('button', { name: /add to encounter/i }));

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  // ── Homebrew monsters (VEG-293) ─────────────────────────────────────────────

  describe('homebrew monsters', () => {
    const caveTroll: SrdMonster = {
      ...goblin,
      id: 'hb-1',
      name: 'Cave Troll',
      contentSource: 'homebrew',
      createdById: 'u1',
      source: 'Homebrew',
    };

    function routeApi(overrides: { onDelete?: () => Promise<unknown> } = {}) {
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation((path: string, options?: { method?: string }) => {
        if (options?.method === 'DELETE') {
          return (overrides.onDelete ?? (() => Promise.resolve(undefined)))();
        }
        if (path.startsWith('/srd/monsters/hb-1')) return Promise.resolve(caveTroll);
        if (path.startsWith('/srd/monsters/')) return Promise.resolve(goblin);
        return Promise.resolve(makeResponse([goblin, caveTroll]));
      });
    }

    function authAsOwner() {
      mockUseAuth.mockReturnValue({
        isDm: false,
        isAdmin: false,
        isAuthenticated: true,
        user: { userId: 'u1' },
      });
    }

    it('shows a Create monster link for signed-in users', async () => {
      authAsOwner();
      renderPage();

      const link = await screen.findByRole('link', { name: /create monster/i });
      expect(link).toHaveAttribute('href', '/srd/monsters/new');
    });

    it('hides the Create monster link for anonymous visitors', async () => {
      mockUseAuth.mockReturnValue({ isDm: false, isAuthenticated: false, user: null });
      renderPage();

      await screen.findByText('Goblin');
      expect(screen.queryByRole('link', { name: /create monster/i })).not.toBeInTheDocument();
    });

    it('flags homebrew monsters with a badge in the list', async () => {
      authAsOwner();
      routeApi();
      renderPage();

      const card = (await screen.findByText('Cave Troll')).closest('button')!;
      expect(within(card).getByText('Homebrew')).toBeInTheDocument();

      const goblinCard = screen.getByText('Goblin').closest('button')!;
      expect(within(goblinCard).queryByText('Homebrew')).not.toBeInTheDocument();
    });

    it('offers Edit and Delete on the owner’s homebrew monster in the detail modal', async () => {
      authAsOwner();
      routeApi();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Cave Troll/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('link', { name: /edit/i })).toHaveAttribute(
        'href',
        '/srd/monsters/hb-1/edit'
      );
      expect(within(dialog).getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('offers no Edit/Delete on SRD monsters', async () => {
      authAsOwner();
      routeApi();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Goblin/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByRole('link', { name: /edit/i })).not.toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('offers no Edit/Delete on someone else’s homebrew (defensive — not normally visible)', async () => {
      mockUseAuth.mockReturnValue({
        isDm: false,
        isAdmin: false,
        isAuthenticated: true,
        user: { userId: 'someone-else' },
      });
      routeApi();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Cave Troll/i }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
    });

    it('deletes a homebrew monster after confirmation and refreshes the list', async () => {
      authAsOwner();
      routeApi();
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Cave Troll/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));

      // ConfirmDialog: confirm the destructive action.
      await user.click(await screen.findByRole('button', { name: /^Delete monster$/i }));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          '/srd/monsters/hb-1',
          expect.objectContaining({ method: 'DELETE' })
        );
      });
      expect(toast.success).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      });
      // List refetched after the delete (initial load + post-delete).
      const listCalls = mockApiFetch.mock.calls.filter(([path]) =>
        String(path).startsWith('/srd/monsters?')
      );
      expect(listCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('toasts and keeps the modal open when the delete fails', async () => {
      authAsOwner();
      routeApi({ onDelete: () => Promise.reject(new Error('nope')) });
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Cave Troll/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));
      await user.click(await screen.findByRole('button', { name: /^Delete monster$/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('nope');
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('offers the print toggle on homebrew monsters — hydration is owner-aware (VEG-331)', async () => {
      authAsOwner();
      routeApi();
      const user = userEvent.setup();
      renderPage();

      await screen.findByText('Cave Troll');
      expect(
        screen.getByRole('button', { name: /add cave troll to print set/i })
      ).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^Cave Troll/i }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('button', { name: /print set/i })).toBeInTheDocument();
    });

    it('toasts and closes instead of sticking on "Loading monster…" when the detail resolves to null', async () => {
      authAsOwner();
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation((path: string) => {
        // Deleted elsewhere / not visible: the endpoint resolves 200 null.
        if (path.startsWith('/srd/monsters/')) return Promise.resolve(null);
        return Promise.resolve(makeResponse([caveTroll]));
      });
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /^Cave Troll/i }));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByText(/loading monster/i)).not.toBeInTheDocument();
    });

    it('clamps back to an in-range page after deleting the last monster on the last page', async () => {
      authAsOwner();
      mockApiFetch.mockReset();
      mockApiFetch.mockImplementation(
        (path: string, options?: { method?: string }): Promise<unknown> => {
          if (options?.method === 'DELETE') return Promise.resolve(undefined);
          if (path.startsWith('/srd/monsters/hb-1')) return Promise.resolve(caveTroll);
          const params = new URLSearchParams(String(path).split('?')[1]);
          const page = Number(params.get('page'));
          // Before delete: 21 rows, page 2 holds only the cave troll. After
          // delete: 20 rows, lastPage shrinks to 1 and page 2 is empty.
          const deleted = mockApiFetch.mock.calls.some(
            ([, o]) => (o as { method?: string } | undefined)?.method === 'DELETE'
          );
          if (deleted) {
            return Promise.resolve(
              page > 1
                ? { data: [], total: 20, page, lastPage: 1 }
                : { data: [goblin], total: 20, page: 1, lastPage: 1 }
            );
          }
          return Promise.resolve(
            page > 1
              ? { data: [caveTroll], total: 21, page, lastPage: 2 }
              : { data: [goblin], total: 21, page: 1, lastPage: 2 }
          );
        }
      );
      const user = userEvent.setup();
      renderPage();

      // Navigate to page 2 (stubbed Pagination requests page 2 on click).
      await user.click(await screen.findByTestId('pagination'));
      await screen.findByText('Cave Troll');

      await user.click(screen.getByRole('button', { name: /^Cave Troll/i }));
      await user.click(await screen.findByRole('button', { name: /delete/i }));
      await user.click(await screen.findByRole('button', { name: /^Delete monster$/i }));

      // The list self-heals back to page 1 instead of stranding the user on an
      // empty page 2.
      await waitFor(() => {
        const listCalls = mockApiFetch.mock.calls.filter(([p]) =>
          String(p).startsWith('/srd/monsters?')
        );
        const lastList = String(listCalls.at(-1)?.[0]);
        expect(new URLSearchParams(lastList.split('?')[1]).get('page')).toBe('1');
      });
      expect(await screen.findByText('Goblin')).toBeInTheDocument();
    });
  });
});
