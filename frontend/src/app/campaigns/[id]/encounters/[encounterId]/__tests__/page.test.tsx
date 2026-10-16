import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithQueryClient } from '@/test-utils/query';
import userEvent from '@testing-library/user-event';
import InitiativeTrackerPage from '../page';
import { ApiError } from '@/lib/api';
import type { Encounter, Combatant } from '@/lib/types';
import {
  makeCombatant,
  makeEncounter,
  routeAddFlow as routeAddFlowFor,
} from '@/test-utils/encounter';

const mockApiFetch = vi.fn();
const mockToastError = vi.fn();
const mockToastSuccess = vi.fn();
const mockUseAuth = vi.fn();

// Preserve the real module (notably `ApiError`) and only stub `apiFetch`, so
// the page's `err instanceof ApiError` 409 branch resolves against the real class.
vi.mock('@/lib/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'camp-1', encounterId: 'enc-1' }),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: (...args: unknown[]) => mockToastSuccess(...args),
  },
}));
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockUseAuth.mockReturnValue({
    user: { userId: 'user-1', username: 'dm', role: 'dungeon_master' },
    isDm: true,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const routeAddFlow = (opts: Parameters<typeof routeAddFlowFor>[1]) =>
  routeAddFlowFor(mockApiFetch, opts);

describe('InitiativeTrackerPage', () => {
  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    renderWithQueryClient(<InitiativeTrackerPage />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows the not-found state and toasts when the request fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('404'));
    renderWithQueryClient(<InitiativeTrackerPage />);
    await waitFor(() => expect(screen.getByText(/encounter not found/i)).toBeInTheDocument());
    expect(mockToastError).toHaveBeenCalledWith('Failed to load encounter');
  });

  it('renders the encounter header, round, and combatants sorted by initiative descending', async () => {
    mockApiFetch.mockResolvedValue(makeEncounter());
    renderWithQueryClient(<InitiativeTrackerPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /goblin ambush/i })).toBeInTheDocument()
    );
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText(/round 1/i)).toBeInTheDocument();

    // Order check: combatants render top-down sorted by initiative DESC.
    const names = screen.getAllByText(/^(Hero|Goblin A|Goblin B)$/).map(n => n.textContent);
    expect(names).toEqual(['Hero', 'Goblin A', 'Goblin B']);

    // NPC badge appears for NPC combatants only
    expect(screen.getAllByText('NPC').length).toBe(2);
  });

  it('hides controller buttons and shows read-only HP for non-controllers', async () => {
    mockUseAuth.mockReturnValue({
      user: { userId: 'someone-else', username: 'p', role: 'player' },
      isDm: false,
    });
    mockApiFetch.mockResolvedValue(makeEncounter());
    renderWithQueryClient(<InitiativeTrackerPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /goblin ambush/i })).toBeInTheDocument()
    );
    expect(screen.queryByRole('button', { name: /start combat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next turn/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.getByText('24/24')).toBeInTheDocument();
  });

  it('lets the creator toggle active state via Start/End Combat', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ isActive: false }));
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ isActive: true }));
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /start combat/i })).toBeInTheDocument()
    );
    await user.click(screen.getByRole('button', { name: /start combat/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /end combat/i })).toBeInTheDocument()
    );
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/encounters/enc-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ isActive: true, expectedVersion: 1 }),
      })
    );
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('advances to the next turn within the round, then bumps the round number on wrap-around', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 0, round: 1 }));
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 1, round: 1 }));
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 2, round: 1 }));
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ currentTurn: 0, round: 2 }));
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/encounters/enc-1',
        expect.objectContaining({
          body: JSON.stringify({ currentTurn: 1, round: 1, expectedVersion: 1 }),
        })
      )
    );

    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/encounters/enc-1',
        expect.objectContaining({
          body: JSON.stringify({ currentTurn: 2, round: 1, expectedVersion: 1 }),
        })
      )
    );

    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenLastCalledWith(
        '/encounters/enc-1',
        expect.objectContaining({
          body: JSON.stringify({ currentTurn: 0, round: 2, expectedVersion: 1 }),
        })
      )
    );
  });

  describe('previous turn (VEG-289)', () => {
    it('steps back within the round', async () => {
      mockApiFetch.mockResolvedValue(makeEncounter({ currentTurn: 2, round: 1, version: 1 }));
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('button', { name: /previous turn/i });
      await user.click(screen.getByRole('button', { name: /previous turn/i }));
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenLastCalledWith(
          '/encounters/enc-1',
          expect.objectContaining({
            body: JSON.stringify({ currentTurn: 1, round: 1, expectedVersion: 1 }),
          })
        )
      );
    });

    it('wraps to the last combatant and decrements the round', async () => {
      mockApiFetch.mockResolvedValue(makeEncounter({ currentTurn: 0, round: 2, version: 1 }));
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('button', { name: /previous turn/i });
      await user.click(screen.getByRole('button', { name: /previous turn/i }));
      await waitFor(() =>
        // 3 combatants → last index 2; round 2 → 1.
        expect(mockApiFetch).toHaveBeenLastCalledWith(
          '/encounters/enc-1',
          expect.objectContaining({
            body: JSON.stringify({ currentTurn: 2, round: 1, expectedVersion: 1 }),
          })
        )
      );
    });

    it('clamps a stale out-of-range turn marker back into range on step back', async () => {
      // 3 combatants but a corrupted marker at index 5 — stepping back must land
      // on a valid row (last index 2) rather than persist another bad index.
      mockApiFetch.mockResolvedValue(makeEncounter({ currentTurn: 5, round: 2, version: 1 }));
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('button', { name: /previous turn/i });
      await user.click(screen.getByRole('button', { name: /previous turn/i }));
      await waitFor(() =>
        expect(mockApiFetch).toHaveBeenLastCalledWith(
          '/encounters/enc-1',
          expect.objectContaining({
            body: JSON.stringify({ currentTurn: 2, round: 2, expectedVersion: 1 }),
          })
        )
      );
    });

    it('is disabled at the very start (round 1, turn 0)', async () => {
      mockApiFetch.mockResolvedValue(makeEncounter({ currentTurn: 0, round: 1 }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      const btn = await screen.findByRole('button', { name: /previous turn/i });
      expect(btn).toBeDisabled();
    });

    it('hides the turn controls from non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(makeEncounter({ createdBy: 'user-1' }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /previous turn/i })).not.toBeInTheDocument();
    });
  });
  it('does not advance turn when every combatant has 0 HP', async () => {
    mockApiFetch.mockResolvedValue(
      makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 0, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin', initiative: 10, hp: 0, maxHp: 7 }),
        ],
      })
    );
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    // Only the initial GET was made — no PATCH.
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
  // ── Roll NPC initiatives (VEG-370) ───────────────────────────────────────────

  describe('roll NPC initiatives', () => {
    afterEach(() => vi.restoreAllMocks());

    function rollableEncounter(over: Partial<Encounter> = {}) {
      return makeEncounter({
        combatants: [
          makeCombatant({ name: 'Aragorn', isNpc: false, initiative: 18, level: 10 }),
          makeCombatant({ name: 'Goblin', isNpc: true, initiative: 5, initiativeMod: 2 }),
          makeCombatant({ name: 'Wolf', isNpc: true, initiative: 4, initiativeMod: -1 }),
          // Hand-typed NPC: no initiativeMod → flat d20.
          makeCombatant({ name: 'Bandit', isNpc: true, initiative: 3 }),
        ],
        ...over,
      });
    }

    function patchBody() {
      const call = mockApiFetch.mock.calls.find(
        ([p, o]) =>
          p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      return call ? JSON.parse((call[1] as { body: string }).body) : undefined;
    }

    const initByName = (combatants: Combatant[]) =>
      Object.fromEntries(combatants.map(c => [c.name, c.initiative]));

    // Open the "Roll initiative" dropdown and pick a mode.
    async function rollNpc(user: ReturnType<typeof userEvent.setup>, mode: 'each' | 'shared') {
      await user.click(screen.getByRole('button', { name: /roll initiative/i }));
      await user.click(
        screen.getByRole('menuitem', {
          name: mode === 'each' ? 'Each NPC separately' : 'One shared roll',
        })
      );
    }

    it('rolls d20 + each NPC modifier in "each" mode and leaves PCs untouched', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // d20 face = 11
      routeAddFlow({ encounter: rollableEncounter({ version: 3 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await rollNpc(user, 'each');
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());

      const body = patchBody()!;
      const init = initByName(body.combatants);
      expect(init.Goblin).toBe(13); // 11 + 2
      expect(init.Wolf).toBe(10); // 11 - 1
      expect(init.Bandit).toBe(11); // flat d20 (no modifier)
      expect(init.Aragorn).toBe(18); // PC untouched
      expect(body.expectedVersion).toBe(3);
    });

    it('rolls one shared d20 for all NPCs in "shared" mode', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // 11
      routeAddFlow({ encounter: rollableEncounter() });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await rollNpc(user, 'shared');
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());

      const init = initByName(patchBody()!.combatants);
      expect(init.Goblin).toBe(11);
      expect(init.Wolf).toBe(11);
      expect(init.Bandit).toBe(11);
      expect(init.Aragorn).toBe(18); // PC untouched
    });

    it('keeps the turn marker on the active combatant across the re-roll', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      // Aragorn (PC) holds the turn; sorted by init he is row 0 (18 > 5 > 4 > 3).
      routeAddFlow({ encounter: rollableEncounter({ currentTurn: 0 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await rollNpc(user, 'each');
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());

      // After rolling, NPCs sit at 13/11/10; Aragorn at 18 still sorts first, so
      // currentTurn stays 0 and the PATCH omits it (unchanged).
      const body = patchBody()!;
      expect(body.currentTurn).toBeUndefined();
    });

    it('hides the controls when there are no NPCs', async () => {
      mockApiFetch.mockResolvedValue(
        makeEncounter({ combatants: [makeCombatant({ name: 'Aragorn', isNpc: false })] })
      );
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /roll initiative/i })).not.toBeInTheDocument();
    });

    it('hides the controls from non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(rollableEncounter({ createdBy: 'user-1' }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /roll initiative/i })).not.toBeInTheDocument();
    });

    it('opens a menu rather than showing the actions inline', async () => {
      routeAddFlow({ encounter: rollableEncounter() });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      // Actions are hidden until the menu is opened (no longer inline).
      expect(
        screen.queryByRole('menuitem', { name: 'Each NPC separately' })
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /roll initiative/i }));
      expect(screen.getByRole('menuitem', { name: 'Each NPC separately' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'One shared roll' })).toBeInTheDocument();
    });
  });

  // ── Encounter difficulty readout (VEG-362) ───────────────────────────────────

  describe('encounter difficulty readout', () => {
    it('shows monster XP/CR and the difficulty band to the controller', async () => {
      mockApiFetch.mockResolvedValue(
        makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', isNpc: false, level: 3 }),
            makeCombatant({ name: 'Goblin A', cr: 0.25, xp: 50 }),
            makeCombatant({ name: 'Goblin B', cr: 0.25, xp: 50 }),
          ],
        })
      );
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      const readout = screen.getByTestId('encounter-difficulty');
      expect(readout).toHaveTextContent('2 monsters');
      expect(readout).toHaveTextContent('100 XP'); // 2 × CR 1/4 (50)
      expect(within(readout).getByTestId('difficulty-band')).toBeInTheDocument();
    });

    it('hides the readout from non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(
        makeEncounter({ createdBy: 'user-1', combatants: [makeCombatant({ cr: 1, xp: 200 })] })
      );
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByTestId('encounter-difficulty')).not.toBeInTheDocument();
    });
  });
  // ── Remove combatant + clear all (VEG-284) ──

  describe('remove combatant + clear all', () => {
    // Same selection rule as the HP-controls helper above: the LAST PATCH,
    // so a test that fires more than one write can't assert on the wrong call.
    const lastPatchBody = () => {
      const call = mockApiFetch.mock.calls
        .filter(
          ([p, o]) =>
            p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
        )
        .at(-1);
      expect(call).toBeDefined();
      return JSON.parse((call![1] as { body: string }).body) as Record<string, unknown>;
    };

    it('removes a row after confirm: PATCHes the filtered combatants array', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /remove goblin a/i }));
      // No PATCH yet — the confirm dialog gates the destructive write.
      expect(
        mockApiFetch.mock.calls.find(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        )
      ).toBeUndefined();
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(/goblin a/i);

      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Removed Goblin A'));
      const body = lastPatchBody();
      expect((body.combatants as { name: string }[]).map(c => c.name)).toEqual([
        'Hero',
        'Goblin B',
      ]);
      expect(body.expectedVersion).toBe(1);
      // currentTurn (0) is still in range after the removal — not re-sent.
      expect('currentTurn' in body).toBe(false);
      // The row is gone from the tracker.
      await waitFor(() => expect(screen.queryByText('Goblin A')).not.toBeInTheDocument());
    });

    it('re-clamps currentTurn in the same PATCH when removal pushes it out of range', async () => {
      routeAddFlow({ encounter: makeEncounter({ currentTurn: 2 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /remove goblin b/i }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Removed Goblin B'));
      const body = lastPatchBody();
      expect((body.combatants as { name: string }[]).map(c => c.name)).toEqual([
        'Hero',
        'Goblin A',
      ]);
      expect(body.currentTurn).toBe(1);
    });

    it('cancelling the remove confirm sends nothing', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /remove goblin a/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        mockApiFetch.mock.calls.find(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        )
      ).toBeUndefined();
      // The row survives.
      expect(screen.getByText('Goblin A')).toBeInTheDocument();
    });

    it('clears all combatants after confirm: empty array plus turn/round reset', async () => {
      routeAddFlow({ encounter: makeEncounter({ currentTurn: 2, round: 3 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /clear all/i }));
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(/round 1/i);
      await user.click(within(dialog).getByRole('button', { name: /clear all/i }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalledWith('Cleared all combatants'));
      expect(lastPatchBody()).toEqual({
        combatants: [],
        currentTurn: 0,
        round: 1,
        expectedVersion: 1,
      });
      // Every row is gone, and so is the clear-all control.
      await waitFor(() => expect(screen.queryByText('Hero')).not.toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
    });

    it('cancelling the clear-all confirm sends nothing', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /clear all/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        mockApiFetch.mock.calls.find(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        )
      ).toBeUndefined();
    });

    it('disables the Clear all button while a write is in flight', async () => {
      // clearAllCombatants silently bails when a write is pending — the button
      // must disable so a confirm can't dead-end into that silent no-op.
      let resolvePatch!: (v: unknown) => void;
      const enc = makeEncounter();
      routeAddFlow({
        encounter: enc,
        onPatch: () =>
          new Promise(res => {
            resolvePatch = res;
          }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      // Start a write via the HP input (blur commits the PATCH).
      const hpInput = screen.getAllByRole('spinbutton')[0];
      fireEvent.change(hpInput, { target: { value: '5' } });
      fireEvent.blur(hpInput);
      expect(screen.getByRole('button', { name: /clear all/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /remove hero/i })).toBeDisabled();

      resolvePatch({ ...enc, version: 2 });
      await waitFor(() => expect(screen.getByRole('button', { name: /clear all/i })).toBeEnabled());
    });

    it('hides the remove and clear-all controls from non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      routeAddFlow({ encounter: makeEncounter() });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument();
    });

    it('refetches and toasts on a 409 remove conflict', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        onPatch: () =>
          Promise.reject(
            new ApiError(409, 'Encounter was modified by another request; re-fetch and retry.', {
              statusCode: 409,
            })
          ),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /remove goblin a/i }));
      const dialog = await screen.findByRole('dialog');
      await user.click(within(dialog).getByRole('button', { name: 'Remove' }));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith(
          'This encounter changed since you opened it — refreshed, please try again.'
        )
      );
      // The conflict recovery refetches the encounter (initial GET + refetch).
      await waitFor(() => {
        const gets = mockApiFetch.mock.calls.filter(
          ([p, o]) => p === '/encounters/enc-1' && !(o as { method?: string } | undefined)?.method
        );
        expect(gets).toHaveLength(2);
      });
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });
});
