import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InitiativeTrackerPage from '../page';
import { ApiError } from '@/lib/api';
import type { Encounter, Combatant, SrdMonster } from '@/lib/types';
import type { CombatantLoot } from '@grimoire-os/shared';

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

function makeCombatant(over: Partial<Combatant> = {}): Combatant {
  return {
    name: 'Goblin',
    initiative: 10,
    hp: 7,
    maxHp: 7,
    ac: 13,
    isNpc: true,
    ...over,
  };
}

const goblinMonster: SrdMonster = {
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
  actions: [{ name: 'Scimitar', description: 'Melee: +4 to hit, 1d6+2 slashing.' }],
  specialAbilities: [{ name: 'Nimble Escape', description: 'Disengage as a bonus action.' }],
  source: 'SRD 5.2.1',
};

function makeLoot(over: Partial<CombatantLoot> = {}): CombatantLoot {
  return {
    coinage: { gp: 2, sp: 5, cp: 10 },
    items: [{ itemId: 'item-1', name: 'Dagger', quantity: 1, source: 'monster' }],
    rolledAt: '2026-06-10T00:00:00.000Z',
    ...over,
  };
}

function makeEncounter(over: Partial<Encounter> = {}): Encounter {
  return {
    id: 'enc-1',
    campaignId: 'camp-1',
    createdBy: 'user-1',
    name: 'Goblin Ambush',
    combatants: [
      makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, ac: 16, isNpc: false }),
      makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, maxHp: 7 }),
      makeCombatant({ name: 'Goblin B', initiative: 8, hp: 7, maxHp: 7 }),
    ],
    currentTurn: 0,
    round: 1,
    isActive: false,
    version: 1,
    createdAt: '',
    updatedAt: '',
    ...over,
  } as Encounter;
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockToastError.mockReset();
  mockToastSuccess.mockReset();
  mockUseAuth.mockReturnValue({
    user: { userId: 'user-1', username: 'dm', role: 'dungeon_master' },
    isDm: true,
  });
});

/**
 * Routes the encounter GET/PATCH and the SRD monster search/detail endpoints
 * for the "add monster from lookup" integration flow. `onPatch` lets a test
 * decide how the PATCH resolves (e.g. reject with a 409).
 */
function routeAddFlow(opts: {
  encounter: Encounter;
  onPatch?: (body: unknown) => Promise<unknown>;
}) {
  const { encounter, onPatch } = opts;
  mockApiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
    if (path === '/encounters/enc-1' && init?.method === 'PATCH') {
      const body = JSON.parse(init.body ?? '{}');
      return onPatch ? onPatch(body) : Promise.resolve({ ...encounter, ...body, version: 99 });
    }
    if (path === '/encounters/enc-1') return Promise.resolve(encounter);
    if (path.startsWith('/srd/monsters/')) return Promise.resolve(goblinMonster);
    if (path.startsWith('/srd/monsters?')) {
      return Promise.resolve({ data: [goblinMonster], total: 1, page: 1, lastPage: 1 });
    }
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

async function addGoblinFromLookup(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: /goblin ambush/i });
  await user.type(screen.getByPlaceholderText(/search monsters/i), 'goblin');
  await user.click(await screen.findByTestId('lookup-result'));
  await screen.findByText('Nimble Escape.'); // stat block loaded
  await user.click(screen.getByRole('button', { name: /add to encounter/i })); // CTA
  await user.click(screen.getByRole('button', { name: /add to encounter/i })); // dialog confirm
}

describe('InitiativeTrackerPage', () => {
  it('shows the loading state before the fetch resolves', () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<InitiativeTrackerPage />);
    expect(screen.getByText(/^loading\.\.\./i)).toBeInTheDocument();
  });

  it('shows the not-found state and toasts when the request fails', async () => {
    mockApiFetch.mockRejectedValue(new Error('404'));
    render(<InitiativeTrackerPage />);
    await waitFor(() => expect(screen.getByText(/encounter not found/i)).toBeInTheDocument());
    expect(mockToastError).toHaveBeenCalledWith('Failed to load encounter');
  });

  it('renders the encounter header, round, and combatants sorted by initiative descending', async () => {
    mockApiFetch.mockResolvedValue(makeEncounter());
    render(<InitiativeTrackerPage />);
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
    render(<InitiativeTrackerPage />);
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
    render(<InitiativeTrackerPage />);
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
    render(<InitiativeTrackerPage />);
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
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    // Only the initial GET was made — no PATCH.
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });

  // ── HP edits commit once, on blur/Enter, version-guarded (VEG-315) ──────────

  it('does not PATCH while typing — only one guarded PATCH on blur, clamped to maxHp', async () => {
    // Goblin A is wounded (5/7) so the clamp to maxHp is a real change.
    const wounded = makeEncounter({
      version: 4,
      combatants: [
        makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
        makeCombatant({ name: 'Goblin A', initiative: 12, hp: 5, maxHp: 7 }),
        makeCombatant({ name: 'Goblin B', initiative: 8, hp: 7, maxHp: 7 }),
      ],
    });
    mockApiFetch.mockResolvedValueOnce(wounded);
    mockApiFetch.mockResolvedValueOnce(makeEncounter({ version: 5 }));
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    // Sorted order: Hero (idx 0), Goblin A (1), Goblin B (2).
    // Two change events simulate typing "9" then "99" — neither may fire a PATCH.
    fireEvent.change(hpInputs[1], { target: { value: '9' } });
    fireEvent.change(hpInputs[1], { target: { value: '99' } });
    expect(mockApiFetch).toHaveBeenCalledTimes(1); // initial GET only
    expect(hpInputs[1].value).toBe('99'); // draft shown while editing

    fireEvent.blur(hpInputs[1]);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.combatants[1].name).toBe('Goblin A');
    expect(body.combatants[1].hp).toBe(7); // clamped to maxHp
    expect(body.expectedVersion).toBe(4); // optimistic-lock guard
  });

  it('commits the HP edit on Enter, clamping negative entries to 0', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    // Focus first so the Enter handler's blur() actually dispatches the blur
    // event in jsdom (blur on an unfocused element is a no-op).
    hpInputs[2].focus();
    fireEvent.change(hpInputs[2], { target: { value: '-5' } });
    fireEvent.keyDown(hpInputs[2], { key: 'Enter' });

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.combatants[2].name).toBe('Goblin B');
    expect(body.combatants[2].hp).toBe(0);
    expect(body.expectedVersion).toBe(1);
  });

  it('skips the PATCH when the committed HP is unchanged', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(hpInputs[1], { target: { value: '7' } }); // same as current hp
    fireEvent.blur(hpInputs[1]);
    expect(mockApiFetch).toHaveBeenCalledTimes(1); // GET only
  });

  it('reverts to the server value when an empty HP edit is committed', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(hpInputs[1], { target: { value: '' } });
    fireEvent.blur(hpInputs[1]);
    expect(mockApiFetch).toHaveBeenCalledTimes(1); // no PATCH
    expect((screen.getAllByRole('spinbutton')[1] as HTMLInputElement).value).toBe('7');
  });

  it('commits the draft to the same combatant even when the list reorders mid-edit', async () => {
    const initial = makeEncounter();
    // An Ogre (init 15) lands above Goblin A while the draft is open —
    // Goblin A shifts from sorted index 1 to index 2.
    const reordered = makeEncounter({
      version: 2,
      isActive: true,
      combatants: [
        makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
        makeCombatant({ name: 'Ogre', initiative: 15, hp: 30, maxHp: 30 }),
        makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, maxHp: 7 }),
        makeCombatant({ name: 'Goblin B', initiative: 8, hp: 7, maxHp: 7 }),
      ],
    });
    mockApiFetch.mockResolvedValueOnce(initial); // GET
    mockApiFetch.mockResolvedValueOnce(reordered); // PATCH (toggleActive) → reordered list
    mockApiFetch.mockResolvedValueOnce(reordered); // PATCH (hp commit)
    const user = userEvent.setup();
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    // Open a draft on Goblin A (index 1 pre-reorder)...
    fireEvent.change((screen.getAllByRole('spinbutton') as HTMLInputElement[])[1], {
      target: { value: '3' },
    });
    // ...then the encounter updates underneath it (here via Start Combat).
    await user.click(screen.getByRole('button', { name: /start combat/i }));
    await screen.findByText('Active');

    // The draft followed Goblin A to its new row (index 2), not index 1 (Ogre).
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    expect(inputs[2].value).toBe('3');
    expect(inputs[1].value).toBe('30');

    fireEvent.blur(inputs[2]);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(3));
    const [, init] = mockApiFetch.mock.calls[2];
    const body = JSON.parse((init as { body: string }).body);
    const byName = Object.fromEntries((body.combatants as Combatant[]).map(c => [c.name, c.hp]));
    expect(byName['Goblin A']).toBe(3); // the edit landed on the right combatant
    expect(byName['Ogre']).toBe(30); // the interloper is untouched
    expect(body.expectedVersion).toBe(2);
  });

  it('targets the edited row, not the first name match, when combatant names collide', async () => {
    // Duplicate names are legal — nothing unique-ifies hand-entered combatants.
    const twins = makeEncounter({
      combatants: [
        makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
        makeCombatant({ name: 'Goblin', initiative: 12, hp: 5, maxHp: 7 }),
        makeCombatant({ name: 'Goblin', initiative: 8, hp: 7, maxHp: 7 }),
      ],
    });
    mockApiFetch.mockResolvedValueOnce(twins);
    mockApiFetch.mockResolvedValueOnce(twins);
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    // Edit the SECOND Goblin (sorted index 2).
    fireEvent.change(hpInputs[2], { target: { value: '2' } });
    // The draft renders only on the edited row, not on its twin.
    expect(hpInputs[2].value).toBe('2');
    expect(hpInputs[1].value).toBe('5');

    fireEvent.blur(hpInputs[2]);
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.combatants[2].hp).toBe(2); // the edited twin
    expect(body.combatants[1].hp).toBe(5); // the first name match is untouched
  });

  it('refetches and warns on a 409 conflict instead of clobbering', async () => {
    const initial = makeEncounter({ version: 4 });
    let patched = false;
    mockApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (init?.method === 'PATCH') {
        patched = true;
        return Promise.reject(
          new ApiError(409, 'Encounter was modified by another request; re-fetch and retry.', {
            currentVersion: 9,
          })
        );
      }
      return Promise.resolve(initial);
    });
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(hpInputs[1], { target: { value: '3' } });
    fireEvent.blur(hpInputs[1]);

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(patched).toBe(true);
    const warning = String(mockToastError.mock.calls.at(-1)?.[0] ?? '');
    expect(warning).toMatch(/chang|refresh|again/i);
    // Re-fetched rather than trusting local state: GET on mount + GET after 409.
    const getCalls = mockApiFetch.mock.calls.filter(
      ([p, o]) => p === '/encounters/enc-1' && !(o as { method?: string } | undefined)?.method
    );
    expect(getCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('toasts when a PATCH fails', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockRejectedValueOnce(new Error('conflict'));
    const user = userEvent.setup();
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('conflict'));
  });

  it('toasts a generic message when the PATCH rejection is not an Error', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockRejectedValueOnce('boom');
    const user = userEvent.setup();
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });
    await user.click(screen.getByRole('button', { name: /next turn/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to update encounter'));
  });

  it('renders the monster-lookup panel for anyone viewing the encounter', async () => {
    mockUseAuth.mockReturnValue({
      user: { userId: 'someone-else', username: 'p', role: 'player' },
      isDm: false,
    });
    mockApiFetch.mockResolvedValue(makeEncounter());
    render(<InitiativeTrackerPage />);
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
    render(<InitiativeTrackerPage />);
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
    render(<InitiativeTrackerPage />);
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
    render(<InitiativeTrackerPage />);
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
    render(<InitiativeTrackerPage />);
    await screen.findByRole('heading', { name: /goblin ambush/i });
    await user.type(screen.getByPlaceholderText(/search monsters/i), 'goblin');
    await user.click(await screen.findByTestId('lookup-result'));
    await screen.findByText('Nimble Escape.');
    expect(screen.queryByRole('button', { name: /add to encounter/i })).not.toBeInTheDocument();
  });

  // ── Click combatant to view stat block (VEG-260) ─────────────────────────────

  it('opens the source stat block when an NPC combatant with a monsterId is clicked', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/encounters/enc-1') {
        return Promise.resolve(
          makeEncounter({
            combatants: [
              makeCombatant({ name: 'Hero', isNpc: false }),
              makeCombatant({ name: 'Goblin A', monsterId: 'monster-1' }),
            ],
          })
        );
      }
      if (path === '/srd/monsters/monster-1') return Promise.resolve(goblinMonster);
      return Promise.reject(new Error(`unexpected path ${path}`));
    });
    const user = userEvent.setup();
    render(<InitiativeTrackerPage />);
    await screen.findByRole('heading', { name: /goblin ambush/i });

    // Linked combatant exposes a clickable affordance; the plain one does not.
    expect(screen.queryByRole('button', { name: /^hero$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^goblin a$/i }));

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/srd/monsters/monster-1'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Nimble Escape.')).toBeInTheDocument();
  });

  // ── Encounter loot: roll triggers, drops, total (VEG-301) ────────────────────

  describe('encounter loot', () => {
    /**
     * Routes the encounter GET, the loot POST, and the PATCH used by HP
     * commits. The default loot roll mirrors the backend: every monster-linked
     * combatant (or just `combatantIndex`) gets `makeLoot()`, version bumps.
     */
    function routeLootFlow(opts: {
      encounter: Encounter;
      onRoll?: (body: { combatantIndex?: number; expectedVersion?: number }) => Promise<unknown>;
      onPatch?: (body: { combatants?: Combatant[]; expectedVersion?: number }) => Promise<unknown>;
    }) {
      const { encounter, onRoll, onPatch } = opts;
      mockApiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
        const body = init?.body ? JSON.parse(init.body) : {};
        if (path === '/encounters/enc-1/loot' && init?.method === 'POST') {
          if (onRoll) return onRoll(body);
          const updated = {
            ...encounter,
            version: encounter.version + 1,
            combatants: encounter.combatants.map((c, idx) =>
              c.monsterId && (body.combatantIndex === undefined || body.combatantIndex === idx)
                ? { ...c, loot: makeLoot() }
                : c
            ),
          };
          return Promise.resolve({ encounter: updated, lootTotal: null });
        }
        if (path === '/encounters/enc-1' && init?.method === 'PATCH') {
          if (onPatch) return onPatch(body);
          return Promise.resolve({ ...encounter, ...body, version: encounter.version + 1 });
        }
        if (path === '/encounters/enc-1') return Promise.resolve(encounter);
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
    }

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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('3 gp · 5 sp · 12 cp')).toBeInTheDocument();
      expect(screen.getByText(/2× Dagger/)).toBeInTheDocument();
    });

    it('disables the encounter roll when no combatant links to a monster', async () => {
      routeLootFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          ],
        }),
      });
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('checkbox', { name: /auto-roll loot on death/i }));

      const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
      // Hero (no monsterId) dies — no roll.
      fireEvent.change(hpInputs[0], { target: { value: '0' } });
      fireEvent.blur(hpInputs[0]);
      // Goblin A already rolled — dying again must not clobber its drop.
      fireEvent.change(hpInputs[1], { target: { value: '0' } });
      fireEvent.blur(hpInputs[1]);

      await waitFor(() => {
        const patches = mockApiFetch.mock.calls.filter(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        );
        expect(patches.length).toBe(2);
      });
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      await user.click(screen.getByRole('button', { name: /roll loot for goblin a/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Failed to roll loot'));
    });
  });
});
