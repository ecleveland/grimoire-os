import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithQueryClient } from '@/test-utils/query';
import userEvent from '@testing-library/user-event';
import InitiativeTrackerPage from '../page';
import { ApiError } from '@/lib/api';
import {
  makeCombatant,
  makeLoot,
  makeEncounter,
  addGoblinFromLookup,
  routeAddFlow as routeAddFlowFor,
  routeLootFlow as routeLootFlowFor,
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
const routeLootFlow = (opts: Parameters<typeof routeLootFlowFor>[1]) =>
  routeLootFlowFor(mockApiFetch, opts);

describe('InitiativeTrackerPage', () => {
  // ── Encounter loot: roll triggers, drops, total (VEG-301) ────────────────────

  describe('encounter loot', () => {
    it('offers roll-loot only on monster-linked rows', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' }),
            makeCombatant({ name: 'Orc', initiative: 8 }), // manual NPC, no monsterId
          ],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByRole('button', { name: /roll loot for goblin a/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /roll loot for hero/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /roll loot for orc/i })).not.toBeInTheDocument();
    });

    it('rolls loot for one combatant via its combatants-array index and renders the drop', async () => {
      // Array order ≠ sorted order on purpose: Goblin A renders as row 1 but
      // lives at array index 2 — the POST must carry the ARRAY index.
      routeLootFlow({
        encounter: makeEncounter({
          version: 3,
          combatants: [
            makeCombatant({ name: 'Goblin B', initiative: 8, monsterId: 'monster-1' }),
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' }),
          ],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /roll loot for goblin a/i }));

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(
          ([p, o]) =>
            p === '/encounters/enc-1/loot' &&
            (o as { method?: string } | undefined)?.method === 'POST'
        );
        expect(call).toBeDefined();
        expect(JSON.parse((call![1] as { body: string }).body)).toEqual({
          combatantIndex: 2,
          expectedVersion: 3,
        });
      });

      // The drop renders inline (row) and feeds the encounter total — with a
      // single rolled combatant both show the same line.
      expect(await screen.findAllByText('2 gp · 5 sp · 10 cp')).toHaveLength(2);
      expect(screen.getAllByText(/1× Dagger/)).toHaveLength(2);
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    });

    it('rolls loot for the whole encounter and shows per-monster drops plus the aggregated total', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          version: 2,
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' }),
            makeCombatant({ name: 'Goblin B', initiative: 8, monsterId: 'monster-1' }),
          ],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /roll loot for encounter/i }));

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(
          ([p, o]) =>
            p === '/encounters/enc-1/loot' &&
            (o as { method?: string } | undefined)?.method === 'POST'
        );
        expect(call).toBeDefined();
        // No combatantIndex → backend rolls every monster combatant.
        expect(JSON.parse((call![1] as { body: string }).body)).toEqual({ expectedVersion: 2 });
      });

      // Per-monster drops (one per goblin)...
      expect(await screen.findAllByText('2 gp · 5 sp · 10 cp')).toHaveLength(2);
      // ...and the aggregated encounter total: summed coin, merged items.
      expect(screen.getByText('4 gp · 10 sp · 20 cp')).toBeInTheDocument();
      expect(screen.getByText(/2× Dagger/)).toBeInTheDocument();
    });

    it('aggregates the encounter total from loot already present on load', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({
              name: 'Goblin A',
              initiative: 12,
              monsterId: 'monster-1',
              loot: makeLoot(),
            }),
            makeCombatant({
              name: 'Goblin B',
              initiative: 8,
              monsterId: 'monster-1',
              loot: makeLoot({ coinage: { gp: 1, sp: 0, cp: 2 } }),
            }),
          ],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('3 gp · 5 sp · 12 cp')).toBeInTheDocument();
      expect(screen.getByText(/2× Dagger/)).toBeInTheDocument();
    });

    it('leaves zero denominations out of the coin line and shows an empty purse as 0 gp', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({
              name: 'Goblin A',
              initiative: 12,
              monsterId: 'monster-1',
              loot: makeLoot({ coinage: { gp: 2, sp: 0, cp: 0 } }),
            }),
            makeCombatant({
              name: 'Goblin B',
              initiative: 8,
              monsterId: 'monster-1',
              loot: makeLoot({ coinage: { gp: 0, sp: 0, cp: 0 } }),
            }),
          ],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      // Goblin A's row and the encounter total both read 2 gp; Goblin B's row
      // holds no coin at all.
      expect(screen.getAllByText('2 gp')).toHaveLength(2);
      expect(screen.getByText('0 gp')).toBeInTheDocument();
      expect(screen.queryByText(/0 sp|0 cp/)).not.toBeInTheDocument();
    });

    it('disables the encounter roll when no combatant links to a monster', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          ],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByRole('button', { name: /roll loot for encounter/i })).toBeDisabled();
    });

    it('rerolls an already-looted combatant', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          version: 4,
          combatants: [
            makeCombatant({
              name: 'Goblin A',
              initiative: 12,
              monsterId: 'monster-1',
              loot: makeLoot(),
            }),
          ],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      // A looted row offers reroll, not a fresh roll.
      expect(
        screen.queryByRole('button', { name: /^roll loot for goblin a/i })
      ).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /reroll loot for goblin a/i }));

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(
          ([p, o]) =>
            p === '/encounters/enc-1/loot' &&
            (o as { method?: string } | undefined)?.method === 'POST'
        );
        expect(call).toBeDefined();
        expect(JSON.parse((call![1] as { body: string }).body)).toEqual({
          combatantIndex: 0,
          expectedVersion: 4,
        });
      });
    });

    it('confirms before an encounter roll that would replace existing drops', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          version: 2,
          combatants: [
            makeCombatant({
              name: 'Goblin A',
              initiative: 12,
              monsterId: 'monster-1',
              loot: makeLoot(),
            }),
            makeCombatant({ name: 'Goblin B', initiative: 8, monsterId: 'monster-1' }),
          ],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /roll loot for encounter/i }));
      // No POST yet — a confirm dialog explains the drop replacement first.
      expect(mockApiFetch.mock.calls.find(([p]) => p === '/encounters/enc-1/loot')).toBeUndefined();
      const dialog = await screen.findByRole('dialog');
      expect(dialog).toHaveTextContent(/replace/i);

      await user.click(screen.getByRole('button', { name: /roll all/i }));
      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(
          ([p, o]) =>
            p === '/encounters/enc-1/loot' &&
            (o as { method?: string } | undefined)?.method === 'POST'
        );
        expect(call).toBeDefined();
        expect(JSON.parse((call![1] as { body: string }).body)).toEqual({ expectedVersion: 2 });
      });
    });

    it('cancelling the replace-drops confirm sends nothing', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({
              name: 'Goblin A',
              initiative: 12,
              monsterId: 'monster-1',
              loot: makeLoot(),
            }),
          ],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /roll loot for encounter/i }));
      await user.click(screen.getByRole('button', { name: /cancel/i }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(mockApiFetch.mock.calls.find(([p]) => p === '/encounters/enc-1/loot')).toBeUndefined();
    });

    // ── Write serialization: loot buttons disable while a write is in flight ──

    it('disables the loot buttons while an HP commit PATCH is in flight', async () => {
      // The blur-then-click sequence: typing HP and clicking Roll loot fires
      // blur (PATCH) before click (POST). With the buttons disabled during the
      // pending write, the click is swallowed instead of 409ing on the stale
      // version and dropping a write.
      let resolvePatch!: (v: unknown) => void;
      const enc = makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' }),
        ],
      });
      routeLootFlow({
        encounter: enc,
        onPatch: () =>
          new Promise(res => {
            resolvePatch = res;
          }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const rollBtn = screen.getByRole('button', { name: /roll loot for goblin a/i });
      expect(rollBtn).toBeEnabled();
      const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      fireEvent.change(hpInputs[1], { target: { value: '3' } });
      fireEvent.blur(hpInputs[1]); // PATCH now pending
      expect(rollBtn).toBeDisabled();
      expect(screen.getByRole('button', { name: /roll loot for encounter/i })).toBeDisabled();

      resolvePatch({ ...enc, version: 2 });
      await waitFor(() => expect(rollBtn).toBeEnabled());
    });

    it('sends a single POST when a roll button is double-clicked', async () => {
      let resolveRoll!: (v: unknown) => void;
      const enc = makeEncounter({
        combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' })],
      });
      routeLootFlow({
        encounter: enc,
        onRoll: () =>
          new Promise(res => {
            resolveRoll = res;
          }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const btn = screen.getByRole('button', { name: /roll loot for encounter/i });
      fireEvent.click(btn);
      fireEvent.click(btn); // second click lands on a disabled button
      const posts = mockApiFetch.mock.calls.filter(([p]) => p === '/encounters/enc-1/loot');
      expect(posts).toHaveLength(1);

      resolveRoll({
        encounter: { ...enc, version: 2, combatants: enc.combatants },
        lootTotal: null,
      });
      await waitFor(() => expect(btn).toBeEnabled());
    });

    it('keeps the loot guard up while an overlapping shorter write resolves', async () => {
      // writePending must count overlapping writes: a quick Next Turn PATCH
      // finishing mid-roll must not re-enable the loot buttons while the roll
      // POST is still in flight.
      let resolveRoll!: (v: unknown) => void;
      const enc = makeEncounter({
        combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' })],
      });
      routeLootFlow({
        encounter: enc,
        onRoll: () =>
          new Promise(res => {
            resolveRoll = res;
          }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const rollBtn = screen.getByRole('button', { name: /roll loot for goblin a/i });
      fireEvent.click(rollBtn); // roll POST pending
      expect(rollBtn).toBeDisabled();

      // Next Turn's PATCH starts and resolves while the roll is still pending.
      fireEvent.click(screen.getByRole('button', { name: /next turn/i }));
      await waitFor(() => {
        const patch = mockApiFetch.mock.calls.find(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        );
        expect(patch).toBeDefined();
      });
      expect(rollBtn).toBeDisabled(); // still guarded by the in-flight POST

      resolveRoll({
        encounter: {
          ...enc,
          version: 2,
          combatants: [{ ...enc.combatants[0], loot: makeLoot() }],
        },
        lootTotal: null,
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /reroll loot for goblin a/i })).toBeEnabled()
      );
    });

    it('guards the add-monster PATCH with the same write lock', async () => {
      let resolvePatch!: (v: unknown) => void;
      const enc = makeEncounter({
        version: 3,
        combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' })],
      });
      routeAddFlow({
        encounter: enc,
        onPatch: () =>
          new Promise(res => {
            resolvePatch = res;
          }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await addGoblinFromLookup(user); // add PATCH now pending

      expect(screen.getByRole('button', { name: /roll loot for goblin a/i })).toBeDisabled();
      resolvePatch({ ...enc, version: 4 });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /roll loot for goblin a/i })).toBeEnabled()
      );
    });

    it('drops an HP draft committed during a roll instead of racing the version guard', async () => {
      let resolveRoll!: (v: unknown) => void;
      const enc = makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' }),
        ],
      });
      routeLootFlow({
        encounter: enc,
        onRoll: () =>
          new Promise(res => {
            resolveRoll = res;
          }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.click(screen.getByRole('button', { name: /roll loot for goblin a/i }));
      const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      fireEvent.change(hpInputs[0], { target: { value: '5' } });
      fireEvent.blur(hpInputs[0]); // committed mid-roll: reverts, no PATCH

      expect(
        mockApiFetch.mock.calls.find(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        )
      ).toBeUndefined();
      expect((screen.getAllByRole('spinbutton')[0] as HTMLInputElement).value).toBe('24');

      resolveRoll({
        encounter: {
          ...enc,
          version: 2,
          combatants: [enc.combatants[0], { ...enc.combatants[1], loot: makeLoot() }],
        },
        lootTotal: null,
      });
      await waitFor(() =>
        expect(screen.getByRole('button', { name: /reroll loot for goblin a/i })).toBeEnabled()
      );
    });

    it('keeps the drop view at full contrast on a dead row', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          // Hero holds the current turn so the dead goblin gets the dimmed
          // (non-current) styling.
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({
              name: 'Goblin A',
              initiative: 12,
              hp: 0,
              monsterId: 'monster-1',
              loot: makeLoot(),
            }),
          ],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      // The drop (first match = the row copy) must not inherit the dead-row
      // dimming — it's exactly the text the DM needs to read out.
      const coin = screen.getAllByText('2 gp · 5 sp · 10 cp')[0];
      expect(coin.closest('.opacity-60')).toBeNull();
      // The combatant's stats line still dims.
      expect(
        screen.getByRole('button', { name: /^goblin a$/i }).closest('.opacity-60')
      ).not.toBeNull();
    });

    // ── Auto-roll on death ───────────────────────────────────────────────────

    it('auto-rolls loot when an HP commit drops a monster to 0 and the toggle is on', async () => {
      const enc = makeEncounter({
        version: 1,
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' }),
        ],
      });
      routeLootFlow({
        encounter: enc,
        // PATCH lands at version 5 — the follow-up roll must guard on THAT
        // version, not the stale pre-patch one.
        onPatch: body => Promise.resolve({ ...enc, ...body, version: 5 }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('checkbox', { name: /auto-roll loot on death/i }));
      const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      fireEvent.change(hpInputs[1], { target: { value: '0' } }); // Goblin A, sorted row 1
      fireEvent.blur(hpInputs[1]);

      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(
          ([p, o]) =>
            p === '/encounters/enc-1/loot' &&
            (o as { method?: string } | undefined)?.method === 'POST'
        );
        expect(call).toBeDefined();
        expect(JSON.parse((call![1] as { body: string }).body)).toEqual({
          combatantIndex: 1,
          expectedVersion: 5,
        });
      });
      expect(await screen.findAllByText('2 gp · 5 sp · 10 cp')).toHaveLength(2);
    });

    it('does not auto-roll when the toggle is off (the default)', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' }),
          ],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      fireEvent.change(hpInputs[1], { target: { value: '0' } });
      fireEvent.blur(hpInputs[1]);

      await waitFor(() => {
        const patch = mockApiFetch.mock.calls.find(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        );
        expect(patch).toBeDefined();
      });
      expect(mockApiFetch.mock.calls.find(([p]) => p === '/encounters/enc-1/loot')).toBeUndefined();
    });

    it('does not auto-roll for unlinked combatants or ones that already have loot', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({
              name: 'Goblin A',
              initiative: 12,
              monsterId: 'monster-1',
              loot: makeLoot(),
            }),
          ],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('checkbox', { name: /auto-roll loot on death/i }));

      const patchCount = () =>
        mockApiFetch.mock.calls.filter(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        ).length;

      const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      // Hero (no monsterId) dies — no roll. Wait for the commit to settle:
      // a second commit fired mid-write is intentionally dropped by the
      // write lock.
      fireEvent.change(hpInputs[0], { target: { value: '0' } });
      fireEvent.blur(hpInputs[0]);
      await waitFor(() => expect(patchCount()).toBe(1));
      // Goblin A already rolled — dying again must not clobber its drop.
      fireEvent.change(hpInputs[1], { target: { value: '0' } });
      fireEvent.blur(hpInputs[1]);
      await waitFor(() => expect(patchCount()).toBe(2));
      expect(mockApiFetch.mock.calls.find(([p]) => p === '/encounters/enc-1/loot')).toBeUndefined();
    });

    // ── Gating + failure paths ───────────────────────────────────────────────

    it('hides all loot UI from non-controllers, even when loot exists', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      routeLootFlow({
        encounter: makeEncounter({
          createdBy: 'user-1',
          combatants: [
            makeCombatant({
              name: 'Goblin A',
              initiative: 12,
              monsterId: 'monster-1',
              loot: makeLoot(),
            }),
          ],
        }),
      });
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /roll loot/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reroll loot/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox', { name: /auto-roll/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/encounter loot/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/dagger/i)).not.toBeInTheDocument();
    });

    it('refetches and warns when the loot roll hits a 409 conflict', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' })],
        }),
        onRoll: () =>
          Promise.reject(
            new ApiError(409, 'Encounter was modified by another request; re-fetch and retry.', {
              currentVersion: 9,
            })
          ),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /roll loot for encounter/i }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(String(mockToastError.mock.calls.at(-1)?.[0] ?? '')).toMatch(/chang|refresh|again/i);
      expect(mockToastSuccess).not.toHaveBeenCalled();
      const getCalls = mockApiFetch.mock.calls.filter(
        ([p, o]) => p === '/encounters/enc-1' && !(o as { method?: string } | undefined)?.method
      );
      expect(getCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('toasts the message when the loot roll fails with an Error', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' })],
        }),
        onRoll: () => Promise.reject(new Error('loot service down')),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /roll loot for goblin a/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('loot service down'));
    });

    it('toasts a generic message when the loot roll rejection is not an Error', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' })],
        }),
        onRoll: () => Promise.reject('boom'),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /roll loot for goblin a/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to roll loot'));
    });
  });
});
