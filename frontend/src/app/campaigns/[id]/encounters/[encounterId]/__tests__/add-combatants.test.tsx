import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { renderWithQueryClient } from '@/test-utils/query';
import userEvent from '@testing-library/user-event';
import InitiativeTrackerPage from '../page';
import { ApiError } from '@/lib/api';
import type { Encounter, Combatant, PartyCharacter, SrdMonster } from '@/lib/types';
import {
  makeCombatant,
  makeLoot,
  makeEncounter,
  goblinMonster,
  addGoblinFromLookup,
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
  it('renders the monster-lookup panel for anyone viewing the encounter', async () => {
    mockUseAuth.mockReturnValue({
      user: { userId: 'someone-else', username: 'p', role: 'player' },
      isDm: false,
    });
    mockApiFetch.mockResolvedValue(makeEncounter());
    renderWithQueryClient(<InitiativeTrackerPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /goblin ambush/i })).toBeInTheDocument()
    );
    expect(screen.getByText(/monster lookup/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/search monsters/i)).toBeInTheDocument();
    // The panel is idle on mount: only the encounter GET ran, no monster search.
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  it('shows controller buttons for a non-DM creator', async () => {
    mockUseAuth.mockReturnValue({
      user: { userId: 'user-1', username: 'creator', role: 'player' },
      isDm: false,
    });
    mockApiFetch.mockResolvedValue(makeEncounter({ createdBy: 'user-1' }));
    renderWithQueryClient(<InitiativeTrackerPage />);
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /goblin ambush/i })).toBeInTheDocument()
    );
    expect(screen.getByRole('button', { name: /next turn/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start combat/i })).toBeInTheDocument();
  });

  // ── Add monster from the lookup panel (VEG-260) ──────────────────────────────

  it('appends a monster combatant via a version-guarded PATCH and toasts success', async () => {
    routeAddFlow({
      encounter: makeEncounter({
        version: 3,
        combatants: [makeCombatant({ name: 'Hero', isNpc: false, monsterId: undefined })],
      }),
    });
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await addGoblinFromLookup(user);

    let patchBody: { combatants: Combatant[]; expectedVersion: number } | undefined;
    await waitFor(() => {
      const call = mockApiFetch.mock.calls.find(
        ([p, o]) =>
          p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      expect(call).toBeDefined();
      patchBody = JSON.parse((call![1] as { body: string }).body);
    });

    // Optimistic-lock guard carries the version we read.
    expect(patchBody!.expectedVersion).toBe(3);
    // Existing combatants preserved; the goblin is appended, pre-filled from the stat block.
    const added = patchBody!.combatants[patchBody!.combatants.length - 1];
    expect(added).toMatchObject({
      name: 'Goblin',
      ac: 15,
      hp: 7,
      maxHp: 7,
      isNpc: true,
      monsterId: 'monster-1',
      initiative: 10,
    });
    expect(patchBody!.combatants[0].name).toBe('Hero');
    await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
  });

  it('surfaces the 409 conflict path on add: re-fetches and warns instead of overwriting', async () => {
    routeAddFlow({
      encounter: makeEncounter({ version: 3 }),
      onPatch: () =>
        Promise.reject(
          new ApiError(409, 'Encounter was modified by another request; re-fetch and retry.', {
            currentVersion: 9,
          })
        ),
    });
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await addGoblinFromLookup(user);

    // Conflict → guidance toast, no success.
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockToastSuccess).not.toHaveBeenCalled();
    const warning = String(mockToastError.mock.calls.at(-1)?.[0] ?? '');
    expect(warning).toMatch(/chang|refresh|again/i);

    // Re-fetched the encounter (GET after the failed PATCH) rather than trusting local state.
    const getCalls = mockApiFetch.mock.calls.filter(
      ([p, o]) => p === '/encounters/enc-1' && !(o as { method?: string } | undefined)?.method
    );
    expect(getCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not offer the add CTA to non-controllers in the lookup panel', async () => {
    mockUseAuth.mockReturnValue({
      user: { userId: 'someone-else', username: 'p', role: 'player' },
      isDm: false,
    });
    routeAddFlow({ encounter: makeEncounter({ version: 3, createdBy: 'user-1' }) });
    const user = userEvent.setup();
    renderWithQueryClient(<InitiativeTrackerPage />);
    await screen.findByRole('heading', { name: /goblin ambush/i });
    await user.type(screen.getByPlaceholderText(/search monsters/i), 'goblin');
    await user.click(await screen.findByTestId('lookup-result'));
    await screen.findByText('Nimble Escape.');
    expect(screen.queryByRole('button', { name: /add to encounter/i })).not.toBeInTheDocument();
  });
  // ── Homebrew monsters in tracker flows (VEG-293) ─────────────────────────────
  // Same code paths as SRD monsters — these pin that a homebrew monster coming
  // back from the (now owner-aware) endpoints flows through lookup, add, and
  // click-to-view, flagged as homebrew in the stat block.

  describe('homebrew monsters in tracker flows', () => {
    const homebrewTroll: SrdMonster = {
      ...goblinMonster,
      id: 'hb-1',
      name: 'Cave Troll',
      armorClass: 14,
      hitPoints: 84,
      contentSource: 'homebrew',
      createdById: 'user-1',
      source: 'Homebrew',
      specialAbilities: [{ name: 'Regeneration', description: 'Regains 10 hp.' }],
    };

    function routeHomebrew(onPatch?: (body: unknown) => Promise<unknown>) {
      const encounter = makeEncounter({ version: 3 });
      mockApiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
        if (path === '/encounters/enc-1' && init?.method === 'PATCH') {
          const body = JSON.parse(init.body ?? '{}');
          return onPatch ? onPatch(body) : Promise.resolve({ ...encounter, ...body, version: 99 });
        }
        if (path === '/encounters/enc-1') return Promise.resolve(encounter);
        if (path.startsWith('/srd/monsters/')) return Promise.resolve(homebrewTroll);
        if (path.startsWith('/srd/monsters?')) {
          return Promise.resolve({ data: [homebrewTroll], total: 1, page: 1, lastPage: 1 });
        }
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
    }

    it('adds a homebrew monster from the lookup panel exactly like an SRD one', async () => {
      routeHomebrew();
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.type(screen.getByPlaceholderText(/search monsters/i), 'troll');
      await user.click(await screen.findByTestId('lookup-result'));
      const statBlock = await screen.findByTestId('monster-stat-block');
      expect(within(statBlock).getByText('Homebrew')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /add to encounter/i }));
      await user.click(screen.getByRole('button', { name: /add to encounter/i }));

      let patchBody: { combatants: Array<Record<string, unknown>> } | undefined;
      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(
          ([p, o]) =>
            p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
        );
        expect(call).toBeDefined();
        patchBody = JSON.parse((call![1] as { body: string }).body);
      });

      const added = patchBody!.combatants[patchBody!.combatants.length - 1];
      expect(added).toMatchObject({
        name: 'Cave Troll',
        ac: 14,
        hp: 84,
        maxHp: 84,
        isNpc: true,
        monsterId: 'hb-1',
      });
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    });
  });
  // ── Add party PCs as combatants (VEG-283) ────────────────────────────────────

  describe('add party PCs', () => {
    const thia: PartyCharacter = {
      id: 'char-1',
      userId: 'user-2',
      name: 'Thia',
      race: 'Elf',
      class: 'Wizard',
      level: 5,
      armorClass: 12,
      initiative: 2,
      hitPoints: { max: 22, current: 17, temporary: 0 },
    };
    const mort: PartyCharacter = {
      id: 'char-2',
      userId: 'user-3',
      name: 'Mort',
      race: 'Human',
      class: 'Rogue',
      level: 3,
      armorClass: 14,
      initiative: 3,
      hitPoints: { max: 18, current: 18, temporary: 0 },
    };

    async function openAddParty(user: ReturnType<typeof userEvent.setup>) {
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /add party/i }));
      return within(await screen.findByRole('dialog'));
    }

    it('fetches the campaign roster and appends selected PCs via a version-guarded PATCH', async () => {
      routeAddFlow({ encounter: makeEncounter({ version: 5 }), characters: [thia, mort] });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddParty(user);

      // Roster fetched from the campaign-scoped endpoint.
      expect(mockApiFetch).toHaveBeenCalledWith('/campaigns/camp-1/characters');

      await dialog.findByText('Thia');
      const mortInit = dialog.getByRole('spinbutton', { name: /initiative for mort/i });
      await user.clear(mortInit);
      await user.type(mortInit, '17');
      await user.click(dialog.getByRole('button', { name: /add selected/i }));

      let patchBody: { combatants: Combatant[]; expectedVersion: number } | undefined;
      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(
          ([p, o]) =>
            p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
        );
        expect(call).toBeDefined();
        patchBody = JSON.parse((call![1] as { body: string }).body);
      });

      expect(patchBody!.expectedVersion).toBe(5);
      // Both PCs appended after the existing three combatants: sheet snapshot,
      // isNpc false, no monsterId, linked to the source characterId (VEG-256).
      expect(patchBody!.combatants).toHaveLength(5);
      expect(patchBody!.combatants[3]).toEqual({
        name: 'Thia',
        initiative: 10,
        hp: 17,
        maxHp: 22,
        ac: 12,
        isNpc: false,
        characterId: 'char-1',
        level: 5,
      });
      expect(patchBody!.combatants[4]).toEqual({
        name: 'Mort',
        initiative: 17,
        hp: 18,
        maxHp: 18,
        ac: 14,
        isNpc: false,
        characterId: 'char-2',
        level: 3,
      });
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not offer the add-party control to non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(makeEncounter({ createdBy: 'user-1' }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /add party/i })).not.toBeInTheDocument();
    });

    it('toasts and closes the dialog when the roster fetch fails', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        characters: () => Promise.reject(new Error('boom')),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /add party/i }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to load party'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('refetches and warns on a 409, keeping the dialog open for a retry', async () => {
      routeAddFlow({
        encounter: makeEncounter({ version: 5 }),
        characters: [thia],
        onPatch: () =>
          Promise.reject(
            new ApiError(409, 'Encounter was modified by another request; re-fetch and retry.', {
              currentVersion: 9,
            })
          ),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddParty(user);
      await dialog.findByText('Thia');
      await user.click(dialog.getByRole('button', { name: /add selected/i }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(String(mockToastError.mock.calls.at(-1)?.[0] ?? '')).toMatch(/chang|refresh|again/i);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('passes the encounter combatant names so already-present PCs start deselected', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        characters: [thia, { ...mort, name: 'Goblin A' }],
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddParty(user);
      await dialog.findByText('Thia');
      // "Goblin A" is already a combatant — the picker starts it deselected.
      expect(dialog.getByRole('checkbox', { name: /add thia/i })).toBeChecked();
      expect(dialog.getByRole('checkbox', { name: /add goblin a/i })).not.toBeChecked();
      expect(dialog.getByText(/already in encounter/i)).toBeInTheDocument();
    });

    it('retries after a 409 with the refreshed expectedVersion', async () => {
      let currentEncounter = makeEncounter({ version: 5 });
      let patchCount = 0;
      mockApiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
        if (path === '/encounters/enc-1' && init?.method === 'PATCH') {
          patchCount += 1;
          if (patchCount === 1) {
            // Another writer won the race — the refetch must observe v9.
            currentEncounter = makeEncounter({ version: 9 });
            return Promise.reject(
              new ApiError(409, 'Encounter was modified by another request.', {
                currentVersion: 9,
              })
            );
          }
          const body = JSON.parse(init.body ?? '{}');
          return Promise.resolve({ ...currentEncounter, ...body, version: 10 });
        }
        if (path === '/encounters/enc-1') return Promise.resolve(currentEncounter);
        if (path === '/campaigns/camp-1/characters') return Promise.resolve([thia]);
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddParty(user);
      await dialog.findByText('Thia');
      await user.click(dialog.getByRole('button', { name: /add selected/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalled());

      // Retry from the still-open dialog: the second PATCH must carry the
      // refetched version, not the stale v5 the dialog was opened against.
      await user.click(dialog.getByRole('button', { name: /add selected/i }));
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      const patches = mockApiFetch.mock.calls.filter(
        ([p, o]) =>
          p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      expect(patches).toHaveLength(2);
      const retryBody = JSON.parse((patches[1][1] as { body: string }).body);
      expect(retryBody.expectedVersion).toBe(9);
    });

    it('toasts a generic message when the add-party PATCH rejection is not an Error', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        characters: [thia],
        onPatch: () => Promise.reject('string rejection'),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddParty(user);
      await dialog.findByText('Thia');
      await user.click(dialog.getByRole('button', { name: /add selected/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to add party'));
    });
  });

  // ── Add a manual / ad-hoc combatant (VEG-282) ────────────────────────────────

  describe('add manual combatant', () => {
    /** Opens the add-combatant modal and returns the dialog scope for queries. */
    async function openAddCombatant(user: ReturnType<typeof userEvent.setup>) {
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /add combatant/i }));
      return within(screen.getByRole('dialog'));
    }

    it('appends a manual combatant via a version-guarded PATCH, toasts, and closes the modal', async () => {
      routeAddFlow({ encounter: makeEncounter({ version: 3 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddCombatant(user);

      await user.type(dialog.getByLabelText(/^name$/i), 'Animated Armor');
      await user.clear(dialog.getByLabelText(/^initiative$/i));
      await user.type(dialog.getByLabelText(/^initiative$/i), '12');
      await user.clear(dialog.getByLabelText(/^hp$/i));
      await user.type(dialog.getByLabelText(/^hp$/i), '33');
      await user.clear(dialog.getByLabelText(/^max hp$/i));
      await user.type(dialog.getByLabelText(/^max hp$/i), '33');
      await user.clear(dialog.getByLabelText(/^ac$/i));
      await user.type(dialog.getByLabelText(/^ac$/i), '18');
      await user.type(dialog.getByLabelText(/notes/i), 'lair guardian');
      await user.click(dialog.getByRole('button', { name: /add combatant/i }));

      let patchBody: { combatants: Combatant[]; expectedVersion: number } | undefined;
      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(
          ([p, o]) =>
            p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
        );
        expect(call).toBeDefined();
        patchBody = JSON.parse((call![1] as { body: string }).body);
      });

      expect(patchBody!.expectedVersion).toBe(3);
      // Existing combatants preserved; the manual combatant is appended with
      // no monsterId (so it gets no click-to-view affordance).
      expect(patchBody!.combatants).toHaveLength(4);
      expect(patchBody!.combatants[3]).toEqual({
        name: 'Animated Armor',
        initiative: 12,
        hp: 33,
        maxHp: 33,
        ac: 18,
        isNpc: true,
        notes: 'lair guardian',
      });
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('auto-numbers a colliding name and omits blank notes from the body', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddCombatant(user);

      await user.type(dialog.getByLabelText(/^name$/i), 'Goblin A');
      await user.click(dialog.getByRole('button', { name: /add combatant/i }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      const call = mockApiFetch.mock.calls.find(
        ([p, o]) =>
          p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      const body = JSON.parse((call![1] as { body: string }).body);
      const added = body.combatants[body.combatants.length - 1];
      // "Goblin A" is already in the encounter — the new one numbers from 2.
      expect(added.name).toBe('Goblin A 2');
      // Dialog defaults flow through; blank notes never hit the wire.
      expect(added).toEqual({
        name: 'Goblin A 2',
        initiative: 10,
        hp: 10,
        maxHp: 10,
        ac: 10,
        isNpc: true,
      });
    });

    it('does not offer the add-combatant control to non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(makeEncounter({ createdBy: 'user-1' }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /add combatant/i })).not.toBeInTheDocument();
    });

    it('refetches and warns on a 409, keeping the modal open so the entry is not lost', async () => {
      routeAddFlow({
        encounter: makeEncounter({ version: 3 }),
        onPatch: () =>
          Promise.reject(
            new ApiError(409, 'Encounter was modified by another request; re-fetch and retry.', {
              currentVersion: 9,
            })
          ),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddCombatant(user);

      await user.type(dialog.getByLabelText(/^name$/i), 'Trap');
      await user.click(dialog.getByRole('button', { name: /add combatant/i }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(String(mockToastError.mock.calls.at(-1)?.[0] ?? '')).toMatch(/chang|refresh|again/i);
      // Re-fetched (GET after the failed PATCH) rather than trusting local state.
      const getCalls = mockApiFetch.mock.calls.filter(
        ([p, o]) => p === '/encounters/enc-1' && !(o as { method?: string } | undefined)?.method
      );
      expect(getCalls.length).toBeGreaterThanOrEqual(2);
      // The form stays open with the typed values for a retry against fresh state.
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(
        (within(screen.getByRole('dialog')).getByLabelText(/^name$/i) as HTMLInputElement).value
      ).toBe('Trap');
    });

    it('toasts the message when the add PATCH fails with an Error', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        onPatch: () => Promise.reject(new Error('nope')),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddCombatant(user);
      await user.type(dialog.getByLabelText(/^name$/i), 'Trap');
      await user.click(dialog.getByRole('button', { name: /add combatant/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('nope'));
    });

    it('toasts a generic message when the add PATCH rejection is not an Error', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        onPatch: () => Promise.reject('string rejection'),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddCombatant(user);
      await user.type(dialog.getByLabelText(/^name$/i), 'Trap');
      await user.click(dialog.getByRole('button', { name: /add combatant/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to add combatant'));
    });

    it('sends a single PATCH when confirm is clicked again mid-write', async () => {
      let resolvePatch: ((v: unknown) => void) | undefined;
      const encounter = makeEncounter();
      routeAddFlow({
        encounter,
        onPatch: () => new Promise(res => (resolvePatch = res)),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddCombatant(user);
      await user.type(dialog.getByLabelText(/^name$/i), 'Trap');
      const confirm = dialog.getByRole('button', { name: /add combatant/i });
      await user.click(confirm);
      // The write lock disables confirm while the PATCH is in flight.
      expect(confirm).toBeDisabled();
      await user.click(confirm);
      const patches = mockApiFetch.mock.calls.filter(
        ([p, o]) =>
          p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      expect(patches).toHaveLength(1);
      resolvePatch!({ ...encounter, version: 2 });
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
    });
  });

  // ── Turn marker re-anchors on append (VEG-329) ───────────────────────────────
  // currentTurn indexes the initiative-sorted rows. Appending a combatant that
  // sorts above the active row must move currentTurn to the active combatant's
  // new index so the highlight follows the same combatant, not whoever sorted
  // into the old slot. The fix lives in the shared appendCombatants, so all
  // three add paths (manual form, monster lookup, party picker) are covered.
  describe('turn re-anchoring on append (VEG-329)', () => {
    const thia: PartyCharacter = {
      id: 'char-1',
      userId: 'user-2',
      name: 'Thia',
      race: 'Elf',
      class: 'Wizard',
      level: 5,
      armorClass: 12,
      initiative: 2,
      hitPoints: { max: 22, current: 17, temporary: 0 },
    };

    async function openAddCombatant(user: ReturnType<typeof userEvent.setup>) {
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /add combatant/i }));
      return within(screen.getByRole('dialog'));
    }

    function lastPatchBody(): Record<string, unknown> {
      const call = mockApiFetch.mock.calls.findLast(
        ([p, o]) =>
          p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      return JSON.parse((call![1] as { body: string }).body);
    }

    // Same row-container idiom as the initiative-edit marker tests below.
    function highlightedRow(): HTMLElement | null {
      return screen.getByText('»').closest('div.p-4');
    }

    it('re-anchors currentTurn when a manual combatant sorts above the active row', async () => {
      // Default order Hero(18) > Goblin A(12) > Goblin B(8); active is Goblin A.
      routeAddFlow({ encounter: makeEncounter({ version: 3, currentTurn: 1 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddCombatant(user);

      await user.type(dialog.getByLabelText(/^name$/i), 'Trap');
      await user.clear(dialog.getByLabelText(/^initiative$/i));
      await user.type(dialog.getByLabelText(/^initiative$/i), '20');
      await user.click(dialog.getByRole('button', { name: /add combatant/i }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      const body = lastPatchBody();
      // Trap(20) inserts at index 0, pushing Goblin A from index 1 to index 2.
      expect(body.currentTurn).toBe(2);
      expect(body.expectedVersion).toBe(3);

      // The » marker follows Goblin A, not the new top row.
      expect(highlightedRow()).toHaveTextContent('Goblin A');
    });

    it('leaves currentTurn untouched when the new combatant sorts below the active row', async () => {
      // Active is Goblin B(8) at index 2; a lower-initiative add sorts beneath it.
      routeAddFlow({ encounter: makeEncounter({ version: 3, currentTurn: 2 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddCombatant(user);

      await user.type(dialog.getByLabelText(/^name$/i), 'Kobold');
      await user.clear(dialog.getByLabelText(/^initiative$/i));
      await user.type(dialog.getByLabelText(/^initiative$/i), '5');
      await user.click(dialog.getByRole('button', { name: /add combatant/i }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      const body = lastPatchBody();
      // Goblin B stays at index 2 — no currentTurn write (matches the
      // conditional-include pattern of the other re-anchoring paths).
      expect(body).not.toHaveProperty('currentTurn');
      expect(highlightedRow()).toHaveTextContent('Goblin B');
    });

    it('re-anchors currentTurn when a monster from the lookup sorts above the active row', async () => {
      // Active is Goblin B(8) at index 2; the looked-up Goblin rolls init 10.
      routeAddFlow({ encounter: makeEncounter({ version: 3, currentTurn: 2 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await addGoblinFromLookup(user);

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      const body = lastPatchBody();
      // Goblin(10) inserts at index 2, pushing Goblin B from index 2 to index 3.
      expect(body.currentTurn).toBe(3);
      expect(highlightedRow()).toHaveTextContent('Goblin B');
    });

    it('re-anchors currentTurn when party PCs sort above the active row', async () => {
      // Active is Goblin A(12) at index 1; Thia is added at initiative 20.
      routeAddFlow({
        encounter: makeEncounter({ version: 3, currentTurn: 1 }),
        characters: [thia],
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /add party/i }));
      const dialog = within(await screen.findByRole('dialog'));
      const init = await dialog.findByRole('spinbutton', { name: /initiative for thia/i });
      await user.clear(init);
      await user.type(init, '20');
      await user.click(dialog.getByRole('button', { name: /add selected/i }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      const body = lastPatchBody();
      // Thia(20) inserts at index 0, pushing Goblin A from index 1 to index 2.
      expect(body.currentTurn).toBe(2);
      expect(highlightedRow()).toHaveTextContent('Goblin A');
    });

    it('does not write currentTurn when there is no active row (empty encounter)', async () => {
      // Exercises the `active ? … : currentTurn` fallback: sorting an empty list
      // yields no active combatant, so indexOf is never consulted.
      routeAddFlow({ encounter: makeEncounter({ version: 3, combatants: [], currentTurn: 0 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      const dialog = await openAddCombatant(user);

      await user.type(dialog.getByLabelText(/^name$/i), 'Lone Wolf');
      await user.click(dialog.getByRole('button', { name: /add combatant/i }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      const body = lastPatchBody();
      expect(body).not.toHaveProperty('currentTurn');
      expect(body.combatants as Combatant[]).toHaveLength(1);
    });
  });
  // ── Link / unlink a combatant to a monster stat block (VEG-328) ──────────────

  describe('link monster to combatant', () => {
    /** Hero is unlinked; Goblin A is linked. */
    function linkableEncounter(over: Partial<Encounter> = {}) {
      return makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, isNpc: false, monsterId: undefined }),
          makeCombatant({
            name: 'Goblin A',
            initiative: 12,
            monsterId: 'monster-1',
            cr: 0.25,
            xp: 50,
            initiativeMod: 2,
          }),
        ],
        ...over,
      });
    }

    async function linkHero(user: ReturnType<typeof userEvent.setup>) {
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /link monster for hero/i }));
      const dialog = within(await screen.findByRole('dialog'));
      await user.type(dialog.getByLabelText(/search monsters/i), 'goblin');
      await user.click(await dialog.findByTestId('link-result'));
    }

    it('offers Link only on unlinked rows and Unlink only on linked rows', async () => {
      mockApiFetch.mockResolvedValue(linkableEncounter());
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByRole('button', { name: /link monster for hero/i })).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /link monster for goblin a/i })
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /unlink monster from goblin a/i })
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /unlink monster from hero/i })
      ).not.toBeInTheDocument();
    });

    it('hides both affordances from non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      mockApiFetch.mockResolvedValue(linkableEncounter({ createdBy: 'user-1' }));
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /link monster/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /unlink monster/i })).not.toBeInTheDocument();
    });

    it('links the picked monster to the right combatant without touching its other fields', async () => {
      routeAddFlow({ encounter: linkableEncounter({ version: 7 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await linkHero(user);

      let patchBody: { combatants: Combatant[]; expectedVersion: number } | undefined;
      await waitFor(() => {
        const call = mockApiFetch.mock.calls.find(
          ([p, o]) =>
            p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
        );
        expect(call).toBeDefined();
        patchBody = JSON.parse((call![1] as { body: string }).body);
      });

      expect(patchBody!.expectedVersion).toBe(7);
      const hero = patchBody!.combatants.find(c => c.name === 'Hero')!;
      // Linking sets monsterId and snapshots the stat block's cr/xp (VEG-362)
      // for the difficulty readout, while leaving the DM's customized row alone.
      expect(hero.monsterId).toBe('monster-1');
      expect(hero).toMatchObject({ name: 'Hero', initiative: 18, hp: 7, maxHp: 7, ac: 13 });
      expect(hero).toMatchObject({ cr: 0.25, xp: 50, initiativeMod: 2 }); // dex 14 → +2
      const goblin = patchBody!.combatants.find(c => c.name === 'Goblin A')!;
      expect(goblin.monsterId).toBe('monster-1');
      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('links the exact row when unlinked combatants share a name', async () => {
      routeAddFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Trap', initiative: 15, hp: 10, monsterId: undefined }),
            makeCombatant({ name: 'Trap', initiative: 5, hp: 99, monsterId: undefined }),
          ],
        }),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      // Link the second sorted row (initiative 5, hp 99).
      await user.click(screen.getAllByRole('button', { name: /link monster for trap/i })[1]);
      const dialog = within(await screen.findByRole('dialog'));
      await user.type(dialog.getByLabelText(/search monsters/i), 'goblin');
      await user.click(await dialog.findByTestId('link-result'));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      const call = mockApiFetch.mock.calls.find(
        ([p, o]) =>
          p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      const body = JSON.parse((call![1] as { body: string }).body);
      const [first, second] = body.combatants as Combatant[];
      expect(first).toMatchObject({ hp: 10 });
      expect(first.monsterId).toBeUndefined();
      expect(second).toMatchObject({ hp: 99, monsterId: 'monster-1' });
    });

    it('refetches and warns on a 409, keeping the picker open for a retry', async () => {
      routeAddFlow({
        encounter: linkableEncounter({ version: 7 }),
        onPatch: () =>
          Promise.reject(
            new ApiError(409, 'Encounter was modified by another request; re-fetch and retry.', {
              currentVersion: 9,
            })
          ),
      });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await linkHero(user);

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(String(mockToastError.mock.calls.at(-1)?.[0] ?? '')).toMatch(/chang|refresh|again/i);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('unlinks a mislinked combatant, removing only its monsterId', async () => {
      routeAddFlow({ encounter: linkableEncounter({ version: 7 }) });
      const user = userEvent.setup();
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /unlink monster from goblin a/i }));

      await waitFor(() => expect(mockToastSuccess).toHaveBeenCalled());
      const call = mockApiFetch.mock.calls.find(
        ([p, o]) =>
          p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      const body = JSON.parse((call![1] as { body: string }).body);
      expect(body.expectedVersion).toBe(7);
      const goblin = (body.combatants as Combatant[]).find(c => c.name === 'Goblin A')!;
      expect(goblin).not.toHaveProperty('monsterId');
      // The stat-block snapshot goes with the linkage (VEG-362/363), so the row
      // stops counting toward difficulty and reverts to a flat d20 init roll.
      expect(goblin).not.toHaveProperty('cr');
      expect(goblin).not.toHaveProperty('xp');
      expect(goblin).not.toHaveProperty('initiativeMod');
      expect(goblin).toMatchObject({ initiative: 12, hp: 7, maxHp: 7, ac: 13 });
    });

    it('hides the Reroll control on a looted row that lost its linkage', async () => {
      mockApiFetch.mockResolvedValue(
        makeEncounter({
          combatants: [makeCombatant({ name: 'Orphan', monsterId: undefined, loot: makeLoot() })],
        })
      );
      renderWithQueryClient(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      // The drop stays readable (row drop + encounter total), but there's no
      // monster to reroll from.
      expect(screen.getAllByText(/dagger/i).length).toBeGreaterThanOrEqual(1);
      expect(
        screen.queryByRole('button', { name: /reroll loot for orphan/i })
      ).not.toBeInTheDocument();
    });
  });
});
