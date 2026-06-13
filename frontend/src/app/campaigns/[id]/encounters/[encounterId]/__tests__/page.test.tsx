import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InitiativeTrackerPage from '../page';
import { ApiError } from '@/lib/api';
import type { Encounter, Combatant, PartyCharacter, SrdMonster } from '@/lib/types';
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
  characters?: PartyCharacter[] | (() => Promise<PartyCharacter[]>);
}) {
  const { encounter, onPatch, characters } = opts;
  mockApiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
    if (path === '/encounters/enc-1' && init?.method === 'PATCH') {
      const body = JSON.parse(init.body ?? '{}');
      return onPatch ? onPatch(body) : Promise.resolve({ ...encounter, ...body, version: 99 });
    }
    if (path === '/encounters/enc-1') return Promise.resolve(encounter);
    if (path === '/campaigns/camp-1/characters' && characters !== undefined) {
      return typeof characters === 'function' ? characters() : Promise.resolve(characters);
    }
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

  it('floors fractional raw HP edits to whole numbers', async () => {
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    mockApiFetch.mockResolvedValueOnce(makeEncounter());
    render(<InitiativeTrackerPage />);
    await screen.findByRole('button', { name: /next turn/i });

    const hpInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    fireEvent.change(hpInputs[1], { target: { value: '3.5' } });
    fireEvent.blur(hpInputs[1]);

    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
    const [, init] = mockApiFetch.mock.calls[1];
    const body = JSON.parse((init as { body: string }).body);
    expect(body.combatants[1].hp).toBe(3); // never persists fractional HP
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
      render(<InitiativeTrackerPage />);
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

    it('resolves a homebrew monster on click-combatant-to-view, flagged as homebrew', async () => {
      mockApiFetch.mockImplementation((path: string) => {
        if (path === '/encounters/enc-1') {
          return Promise.resolve(
            makeEncounter({
              combatants: [makeCombatant({ name: 'Cave Troll 1', monsterId: 'hb-1' })],
            })
          );
        }
        if (path === '/srd/monsters/hb-1') return Promise.resolve(homebrewTroll);
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /^cave troll 1$/i }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith('/srd/monsters/hb-1'));
      const statBlock = await screen.findByTestId('monster-stat-block');
      expect(within(statBlock).getByText('Homebrew')).toBeInTheDocument();
      expect(within(statBlock).getByText(/Regeneration/)).toBeInTheDocument();
    });

    it('toasts and closes instead of sticking on "Loading monster…" when the monster is not visible to the viewer', async () => {
      mockApiFetch.mockImplementation((path: string) => {
        if (path === '/encounters/enc-1') {
          return Promise.resolve(
            makeEncounter({
              combatants: [makeCombatant({ name: 'Cave Troll 1', monsterId: 'hb-1' })],
            })
          );
        }
        // A player clicking the DM's homebrew-linked combatant: the detail
        // endpoint resolves 200 null because the row isn't theirs.
        if (path === '/srd/monsters/hb-1') return Promise.resolve(null);
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: /^cave troll 1$/i }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(screen.queryByText(/loading monster/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('monster-stat-block')).not.toBeInTheDocument();
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
      render(<InitiativeTrackerPage />);
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
      // isNpc false, no monsterId/characterId.
      expect(patchBody!.combatants).toHaveLength(5);
      expect(patchBody!.combatants[3]).toEqual({
        name: 'Thia',
        initiative: 10,
        hp: 17,
        maxHp: 22,
        ac: 12,
        isNpc: false,
      });
      expect(patchBody!.combatants[4]).toEqual({
        name: 'Mort',
        initiative: 17,
        hp: 18,
        maxHp: 18,
        ac: 14,
        isNpc: false,
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
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /add party/i })).not.toBeInTheDocument();
    });

    it('toasts and closes the dialog when the roster fetch fails', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        characters: () => Promise.reject(new Error('boom')),
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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

  // ── Link / unlink a combatant to a monster stat block (VEG-328) ──────────────

  describe('link monster to combatant', () => {
    /** Hero is unlinked; Goblin A is linked. */
    function linkableEncounter(over: Partial<Encounter> = {}) {
      return makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, isNpc: false, monsterId: undefined }),
          makeCombatant({ name: 'Goblin A', initiative: 12, monsterId: 'monster-1' }),
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /link monster/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /unlink monster/i })).not.toBeInTheDocument();
    });

    it('links the picked monster to the right combatant without touching its other fields', async () => {
      routeAddFlow({ encounter: linkableEncounter({ version: 7 }) });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
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
      // Reference-only linking: monsterId is set, the DM's customized row survives.
      expect(hero.monsterId).toBe('monster-1');
      expect(hero).toMatchObject({ name: 'Hero', initiative: 18, hp: 7, maxHp: 7, ac: 13 });
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
      await linkHero(user);

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      expect(mockToastSuccess).not.toHaveBeenCalled();
      expect(String(mockToastError.mock.calls.at(-1)?.[0] ?? '')).toMatch(/chang|refresh|again/i);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('unlinks a mislinked combatant, removing only its monsterId', async () => {
      routeAddFlow({ encounter: linkableEncounter({ version: 7 }) });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
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
      expect(goblin).toMatchObject({ initiative: 12, hp: 7, maxHp: 7, ac: 13 });
    });

    it('hides the Reroll control on a looted row that lost its linkage', async () => {
      mockApiFetch.mockResolvedValue(
        makeEncounter({
          combatants: [makeCombatant({ name: 'Orphan', monsterId: undefined, loot: makeLoot() })],
        })
      );
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      // The drop stays readable (row drop + encounter total), but there's no
      // monster to reroll from.
      expect(screen.getAllByText(/dagger/i).length).toBeGreaterThanOrEqual(1);
      expect(
        screen.queryByRole('button', { name: /reroll loot for orphan/i })
      ).not.toBeInTheDocument();
    });
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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

  // ── Damage / heal controls + temporary HP (VEG-286) ──────────────────────────

  describe('damage, heal & temporary HP', () => {
    /** Routes the encounter GET, the combatants PATCH, and the loot POST. */
    function routeHpControls(opts: {
      encounter: Encounter;
      onPatch?: (body: { combatants?: Combatant[]; expectedVersion?: number }) => Promise<unknown>;
      onRoll?: (body: { combatantIndex?: number; expectedVersion?: number }) => Promise<unknown>;
    }) {
      const { encounter, onPatch, onRoll } = opts;
      mockApiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
        const body = init?.body ? JSON.parse(init.body) : {};
        if (path === '/encounters/enc-1/loot' && init?.method === 'POST') {
          if (onRoll) return onRoll(body);
          return Promise.reject(new Error('unexpected loot roll'));
        }
        if (path === '/encounters/enc-1' && init?.method === 'PATCH') {
          if (onPatch) return onPatch(body);
          return Promise.resolve({ ...encounter, ...body, version: encounter.version + 1 });
        }
        if (path === '/encounters/enc-1') return Promise.resolve(encounter);
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
    }

    const amountInput = (name: string) =>
      screen.getByRole('textbox', {
        name: new RegExp(`damage or heal amount for ${name}`, 'i'),
      }) as HTMLInputElement;

    const lastPatchBody = () => {
      const call = mockApiFetch.mock.calls
        .filter(
          ([p, o]) =>
            p === '/encounters/enc-1' && (o as { method?: string } | undefined)?.method === 'PATCH'
        )
        .at(-1);
      expect(call).toBeDefined();
      return JSON.parse((call![1] as { body: string }).body) as {
        combatants: Combatant[];
        expectedVersion: number;
      };
    };

    it('shows the temp HP badge to controllers and non-controllers alike', async () => {
      const enc = makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12, tempHp: 5 }),
        ],
      });
      routeHpControls({ encounter: enc });
      const { unmount } = render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('+5 temp')).toBeInTheDocument();
      unmount();

      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('+5 temp')).toBeInTheDocument();
    });

    it('hides the damage/heal controls from non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      routeHpControls({
        encounter: makeEncounter({
          createdBy: 'user-1',
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, tempHp: 5 })],
        }),
      });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.queryByRole('button', { name: /damage goblin a/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /heal goblin a/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /grant temp hp/i })).not.toBeInTheDocument();
      expect(
        screen.queryByRole('textbox', { name: /damage or heal amount/i })
      ).not.toBeInTheDocument();
    });

    it('damage spends temp HP first, spills into real HP, and PATCHes the result', async () => {
      const enc = makeEncounter({
        version: 4,
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, maxHp: 7, tempHp: 5 }),
        ],
      });
      routeHpControls({ encounter: enc });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '8' } });
      // Typing alone never PATCHes — the buttons commit.
      expect(
        mockApiFetch.mock.calls.find(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        )
      ).toBeUndefined();
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));

      await waitFor(() => {
        const body = lastPatchBody();
        expect(body.expectedVersion).toBe(4);
        expect(body.combatants[1]).toMatchObject({ name: 'Goblin A', hp: 4, tempHp: 0 });
        // The untouched combatant is echoed back unchanged.
        expect(body.combatants[0]).toMatchObject({ name: 'Hero', hp: 24 });
      });
      // The amount draft clears once the write lands.
      await waitFor(() => expect(amountInput('Goblin A').value).toBe(''));
    });

    it('damage that only eats temp HP leaves real HP untouched', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, tempHp: 5 })],
        }),
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '3' } });
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));

      await waitFor(() => {
        expect(lastPatchBody().combatants[0]).toMatchObject({ hp: 7, tempHp: 2 });
      });
    });

    it('overkill damage clamps real HP at 0', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 3, tempHp: 2 })],
        }),
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '99' } });
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));

      await waitFor(() => {
        expect(lastPatchBody().combatants[0]).toMatchObject({ hp: 0, tempHp: 0 });
      });
    });

    it('heal clamps to maxHp and never touches temp HP', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Goblin A', initiative: 12, hp: 5, maxHp: 7, tempHp: 4 }),
          ],
        }),
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '10' } });
      await user.click(screen.getByRole('button', { name: /heal goblin a/i }));

      await waitFor(() => {
        expect(lastPatchBody().combatants[0]).toMatchObject({ hp: 7, tempHp: 4 });
      });
    });

    it('a temp HP grant takes the higher value', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, tempHp: 5 })],
        }),
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '8' } });
      await user.click(screen.getByRole('button', { name: /grant temp hp to goblin a/i }));

      await waitFor(() => {
        expect(lastPatchBody().combatants[0]).toMatchObject({ hp: 7, tempHp: 8 });
      });
    });

    it('a lower temp HP grant is a no-op — no PATCH is sent', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7, tempHp: 5 })],
        }),
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '3' } });
      await user.click(screen.getByRole('button', { name: /grant temp hp to goblin a/i }));

      expect(
        mockApiFetch.mock.calls.find(
          ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
        )
      ).toBeUndefined();
      // The draft clears so it's obvious the action was consumed.
      expect(amountInput('Goblin A').value).toBe('');
    });

    it('disables the action buttons until a positive whole number is entered', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7 })],
        }),
      });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const damageBtn = screen.getByRole('button', { name: /damage goblin a/i });
      const healBtn = screen.getByRole('button', { name: /heal goblin a/i });
      const tempBtn = screen.getByRole('button', { name: /grant temp hp to goblin a/i });
      expect(damageBtn).toBeDisabled(); // empty
      expect(healBtn).toBeDisabled();
      expect(tempBtn).toBeDisabled();

      fireEvent.change(amountInput('Goblin A'), { target: { value: '0' } });
      expect(damageBtn).toBeDisabled();
      fireEvent.change(amountInput('Goblin A'), { target: { value: '2.5' } });
      expect(damageBtn).toBeDisabled();
      fireEvent.change(amountInput('Goblin A'), { target: { value: 'abc' } });
      expect(damageBtn).toBeDisabled();

      fireEvent.change(amountInput('Goblin A'), { target: { value: '5' } });
      expect(damageBtn).toBeEnabled();
      expect(healBtn).toBeEnabled();
      expect(tempBtn).toBeEnabled();
    });

    it('targets the edited row, not the first name match, when names collide', async () => {
      // Two goblins named "Goblin": damaging the second (sorted row 2) must
      // not bleed onto its twin at row 1.
      routeHpControls({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({ name: 'Goblin', initiative: 12, hp: 5, maxHp: 7 }),
            makeCombatant({ name: 'Goblin', initiative: 8, hp: 7, maxHp: 7 }),
          ],
        }),
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const amounts = screen.getAllByRole('textbox', {
        name: /damage or heal amount for goblin/i,
      }) as HTMLInputElement[];
      fireEvent.change(amounts[1], { target: { value: '4' } });
      // The draft renders only on the edited row.
      expect(amounts[0].value).toBe('');
      await user.click(screen.getAllByRole('button', { name: /^damage goblin$/i })[1]);

      await waitFor(() => {
        const body = lastPatchBody();
        expect(body.combatants[2].hp).toBe(3); // the edited twin
        expect(body.combatants[1].hp).toBe(5); // the first name match is untouched
      });
    });

    it('damage that drops a monster to 0 funnels through auto-roll-on-death', async () => {
      const enc = makeEncounter({
        version: 1,
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({
            name: 'Goblin A',
            initiative: 12,
            hp: 3,
            tempHp: 2,
            monsterId: 'monster-1',
          }),
        ],
      });
      let rollBody: { combatantIndex?: number; expectedVersion?: number } | undefined;
      routeHpControls({
        encounter: enc,
        // PATCH lands at version 5 — the follow-up roll must guard on THAT
        // version, not the stale pre-patch one.
        onPatch: body => Promise.resolve({ ...enc, ...body, version: 5 }),
        onRoll: body => {
          rollBody = body;
          return Promise.resolve({
            encounter: { ...enc, version: 6 },
            lootTotal: null,
          });
        },
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('checkbox', { name: /auto-roll loot on death/i }));
      fireEvent.change(amountInput('Goblin A'), { target: { value: '5' } });
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));

      await waitFor(() => {
        expect(rollBody).toEqual({ combatantIndex: 1, expectedVersion: 5 });
      });
    });

    it('damage that leaves real HP above 0 does not auto-roll', async () => {
      const enc = makeEncounter({
        combatants: [
          makeCombatant({
            name: 'Goblin A',
            initiative: 12,
            hp: 7,
            tempHp: 5,
            monsterId: 'monster-1',
          }),
        ],
      });
      routeHpControls({ encounter: enc });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('checkbox', { name: /auto-roll loot on death/i }));
      fireEvent.change(amountInput('Goblin A'), { target: { value: '5' } }); // eats temp only
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));

      await waitFor(() => {
        expect(lastPatchBody().combatants[0]).toMatchObject({ hp: 7, tempHp: 0 });
      });
      expect(mockApiFetch.mock.calls.find(([p]) => p === '/encounters/enc-1/loot')).toBeUndefined();
    });

    it('toasts the message when the damage PATCH fails with an Error', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7 })],
        }),
        onPatch: () => Promise.reject(new Error('save failed')),
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '4' } });
      await user.click(screen.getByRole('button', { name: /damage goblin a/i }));
      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('save failed'));
    });

    it('toasts a generic message when the heal PATCH rejection is not an Error', async () => {
      routeHpControls({
        encounter: makeEncounter({
          combatants: [makeCombatant({ name: 'Goblin A', initiative: 12, hp: 5, maxHp: 7 })],
        }),
        onPatch: () => Promise.reject('boom'),
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '2' } });
      await user.click(screen.getByRole('button', { name: /heal goblin a/i }));
      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to update encounter')
      );
    });

    it('sends a single PATCH when an action button is double-clicked mid-write', async () => {
      let resolvePatch!: (v: unknown) => void;
      const enc = makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12, hp: 7 }),
        ],
      });
      routeHpControls({
        encounter: enc,
        onPatch: () =>
          new Promise(res => {
            resolvePatch = res;
          }),
      });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      fireEvent.change(amountInput('Goblin A'), { target: { value: '4' } });
      const damageBtn = screen.getByRole('button', { name: /damage goblin a/i });
      fireEvent.click(damageBtn); // PATCH now pending
      // While the write is in flight every action button is disabled, so the
      // second click is swallowed instead of racing the version guard.
      expect(damageBtn).toBeDisabled();
      expect(screen.getByRole('button', { name: /heal goblin a/i })).toBeDisabled();
      fireEvent.click(damageBtn);
      const patches = mockApiFetch.mock.calls.filter(
        ([, o]) => (o as { method?: string } | undefined)?.method === 'PATCH'
      );
      expect(patches).toHaveLength(1);

      resolvePatch({ ...enc, version: 2 });
      // The draft clears once the write lands.
      await waitFor(() => expect(amountInput('Goblin A').value).toBe(''));
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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
      render(<InitiativeTrackerPage />);
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

  describe('inline initiative editing & tie reorder (VEG-285)', () => {
    it('renders an initiative input per row for controllers, sorted top-down', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const inits = screen.getAllByRole('textbox', {
        name: /^initiative for/i,
      }) as HTMLInputElement[];
      expect(inits.map(i => i.value)).toEqual(['18', '12', '8']);
    });

    it('hides the initiative input and reorder controls from non-controllers', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      // A tie pair, so reorder buttons WOULD render for a controller.
      routeAddFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({ name: 'Goblin A', initiative: 12 }),
            makeCombatant({ name: 'Goblin B', initiative: 12 }),
          ],
        }),
      });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      expect(screen.queryByRole('textbox', { name: /^initiative for/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^move /i })).not.toBeInTheDocument();
      // Initiative still displays as static text.
      expect(screen.getByText('18')).toBeInTheDocument();
    });

    it('does not PATCH while typing — one re-sorted, version-guarded PATCH on blur', async () => {
      routeAddFlow({ encounter: makeEncounter({ version: 4 }) });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', {
        name: 'Initiative for Goblin B',
      }) as HTMLInputElement;
      fireEvent.change(init, { target: { value: '2' } });
      fireEvent.change(init, { target: { value: '20' } });
      expect(mockApiFetch).toHaveBeenCalledTimes(1); // initial GET only
      expect(init.value).toBe('20'); // draft shown while editing

      fireEvent.blur(init);
      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      // Goblin B (20) now sorts above Hero (18); the list persists re-sorted.
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Goblin B',
        'Hero',
        'Goblin A',
      ]);
      expect(body.combatants[0].initiative).toBe(20);
      // Hero held the turn at sorted index 0 — the pointer follows him to index 1.
      expect(body.currentTurn).toBe(1);
      expect(body.expectedVersion).toBe(4);
    });

    it('commits on Enter and omits currentTurn when the active combatant keeps its row', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', { name: 'Initiative for Goblin A' });
      // Focus first so the Enter handler's blur() actually dispatches in jsdom.
      init.focus();
      fireEvent.change(init, { target: { value: '1' } });
      fireEvent.keyDown(init, { key: 'Enter' });

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Hero',
        'Goblin B',
        'Goblin A',
      ]);
      expect(body.combatants[2].initiative).toBe(1);
      // Hero (the active combatant) is still sorted index 0 — no pointer write.
      expect(body.currentTurn).toBeUndefined();
    });

    it('keeps the turn marker on the active combatant when its own initiative moves it', async () => {
      routeAddFlow({ encounter: makeEncounter({ currentTurn: 1 }) }); // Goblin A's turn
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', { name: 'Initiative for Goblin A' });
      init.focus();
      fireEvent.change(init, { target: { value: '30' } });
      fireEvent.keyDown(init, { key: 'Enter' });

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Goblin A',
        'Hero',
        'Goblin B',
      ]);
      expect(body.currentTurn).toBe(0);

      // The UI re-renders from the PATCH response: rows re-sorted, marker still
      // on Goblin A.
      await waitFor(() => {
        const names = screen.getAllByText(/^(Hero|Goblin A|Goblin B)$/).map(n => n.textContent);
        expect(names).toEqual(['Goblin A', 'Hero', 'Goblin B']);
      });
      expect(screen.getByText('»').closest('div.p-4')).toHaveTextContent('Goblin A');
    });

    it('truncates fractional entries and accepts negative initiative', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', { name: 'Initiative for Goblin B' });
      fireEvent.change(init, { target: { value: '-2.7' } });
      fireEvent.blur(init);

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants[2].name).toBe('Goblin B');
      expect(body.combatants[2].initiative).toBe(-2);
    });

    it('skips the PATCH when the committed initiative is unchanged, empty, or non-numeric', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', {
        name: 'Initiative for Goblin B',
      }) as HTMLInputElement;
      fireEvent.change(init, { target: { value: '8' } }); // unchanged
      fireEvent.blur(init);
      fireEvent.change(init, { target: { value: '' } }); // empty
      fireEvent.blur(init);
      fireEvent.change(init, { target: { value: 'abc' } }); // non-numeric
      fireEvent.blur(init);

      expect(mockApiFetch).toHaveBeenCalledTimes(1); // initial GET only
      expect(init.value).toBe('8'); // draft reverted to the server value
    });

    it('a new tie keeps the existing relative order instead of reshuffling', async () => {
      routeAddFlow({ encounter: makeEncounter() });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      // Hero 18 → 12 ties Goblin A; the stable tiebreak keeps Hero above A.
      const init = screen.getByRole('textbox', { name: 'Initiative for Hero' });
      fireEvent.change(init, { target: { value: '12' } });
      fireEvent.blur(init);

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Hero',
        'Goblin A',
        'Goblin B',
      ]);
      expect(body.combatants[0].initiative).toBe(12);

      // Once the update lands, the tie pair grows reorder affordances — and
      // only the tie pair.
      await screen.findByRole('button', { name: 'Move Hero down' });
      expect(screen.getByRole('button', { name: 'Move Goblin A up' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Hero up' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Goblin A down' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Goblin B up' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Goblin B down' })).not.toBeInTheDocument();
    });

    it('targets the edited row, not the first name match, when names collide', async () => {
      routeAddFlow({
        encounter: makeEncounter({
          combatants: [
            makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
            makeCombatant({ name: 'Goblin', initiative: 12 }),
            makeCombatant({ name: 'Goblin', initiative: 8 }),
          ],
        }),
      });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const inits = screen.getAllByRole('textbox', { name: 'Initiative for Goblin' });
      fireEvent.change(inits[1], { target: { value: '15' } });
      fireEvent.blur(inits[1]);

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      // The SECOND Goblin (init 8) was edited to 15 and re-sorted between Hero
      // and its twin — the first Goblin keeps its 12.
      expect(body.combatants.map((c: Combatant) => c.initiative)).toEqual([18, 15, 12]);
    });

    it('toasts the message when the initiative PATCH fails', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        onPatch: () => Promise.reject(new Error('boom')),
      });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', { name: 'Initiative for Goblin B' });
      fireEvent.change(init, { target: { value: '20' } });
      fireEvent.blur(init);

      await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('boom'));
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it('refetches and warns when the initiative edit hits a 409 conflict', async () => {
      routeAddFlow({
        encounter: makeEncounter(),
        onPatch: () =>
          Promise.reject(
            new ApiError(409, 'Encounter was modified by another request; re-fetch and retry.', {
              statusCode: 409,
            })
          ),
      });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      const init = screen.getByRole('textbox', { name: 'Initiative for Goblin B' });
      fireEvent.change(init, { target: { value: '20' } });
      fireEvent.blur(init);

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith(
          'This encounter changed since you opened it — refreshed, please try again.'
        )
      );
      await waitFor(() => {
        const gets = mockApiFetch.mock.calls.filter(
          ([p, o]) => p === '/encounters/enc-1' && !(o as { method?: string } | undefined)?.method
        );
        expect(gets).toHaveLength(2);
      });
    });

    // Four combatants with a tie in the middle — the shared fixture for the
    // reorder tests. Sorted: Hero(18), Goblin A(12), Goblin B(12), Wolf(8).
    const tieEncounter = (over: Partial<Encounter> = {}) =>
      makeEncounter({
        combatants: [
          makeCombatant({ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, isNpc: false }),
          makeCombatant({ name: 'Goblin A', initiative: 12 }),
          makeCombatant({ name: 'Goblin B', initiative: 12 }),
          makeCombatant({ name: 'Wolf', initiative: 8 }),
        ],
        ...over,
      });

    it('offers up/down only inside a tie group', async () => {
      routeAddFlow({ encounter: tieEncounter() });
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      expect(screen.getByRole('button', { name: 'Move Goblin A down' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Move Goblin B up' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Goblin A up' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Move Goblin B down' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^move hero/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^move wolf/i })).not.toBeInTheDocument();
    });

    it('swaps a tied pair and keeps the turn marker on the moved combatant', async () => {
      routeAddFlow({ encounter: tieEncounter({ currentTurn: 1, version: 7 }) }); // Goblin A's turn
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Move Goblin A down' }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Hero',
        'Goblin B',
        'Goblin A',
        'Wolf',
      ]);
      expect(body.currentTurn).toBe(2); // pointer follows Goblin A's identity
      expect(body.expectedVersion).toBe(7);

      await waitFor(() =>
        expect(screen.getByText('»').closest('div.p-4')).toHaveTextContent('Goblin A')
      );
    });

    it('moves a combatant up without touching an unaffected turn pointer', async () => {
      routeAddFlow({ encounter: tieEncounter() }); // Hero's turn (index 0)
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Move Goblin B up' }));

      await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(2));
      const [, reqInit] = mockApiFetch.mock.calls[1];
      const body = JSON.parse((reqInit as { body: string }).body);
      expect(body.combatants.map((c: Combatant) => c.name)).toEqual([
        'Hero',
        'Goblin B',
        'Goblin A',
        'Wolf',
      ]);
      expect(body.currentTurn).toBeUndefined(); // Hero stays at sorted index 0
    });

    it('toasts a generic message when the reorder PATCH rejection is not an Error', async () => {
      routeAddFlow({
        encounter: tieEncounter(),
        onPatch: () => Promise.reject('nope'),
      });
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Move Goblin A down' }));

      await waitFor(() =>
        expect(mockToastError).toHaveBeenCalledWith('Failed to update encounter')
      );
      expect(mockToastSuccess).not.toHaveBeenCalled();
    });
  });

  // VEG-287: per-combatant conditions, concentration, and exhaustion. A
  // single-combatant encounter keeps row resolution unambiguous.
  describe('conditions / concentration / exhaustion (VEG-287)', () => {
    const soloEncounter = (over: Partial<Combatant> = {}) =>
      makeEncounter({
        combatants: [makeCombatant({ name: 'Goblin', ...over })],
        version: 4,
      });

    // GET returns the encounter; PATCH echoes the new combatants back.
    function route(encounter: Encounter) {
      mockApiFetch.mockImplementation((path: string, init?: { method?: string; body?: string }) => {
        if (path === '/encounters/enc-1' && init?.method === 'PATCH') {
          const body = JSON.parse(init.body ?? '{}');
          return Promise.resolve({ ...encounter, ...body, version: encounter.version + 1 });
        }
        if (path === '/encounters/enc-1') return Promise.resolve(encounter);
        return Promise.reject(new Error(`unexpected path ${path}`));
      });
    }

    const lastPatch = () => {
      const calls = mockApiFetch.mock.calls.filter(
        c => (c[1] as { method?: string } | undefined)?.method === 'PATCH'
      );
      const last = calls[calls.length - 1];
      return last ? JSON.parse((last[1] as { body: string }).body) : undefined;
    };

    it('adds a condition and persists it with expectedVersion', async () => {
      route(soloEncounter());
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.selectOptions(screen.getByLabelText('Add condition to Goblin'), 'Poisoned');

      await waitFor(() => expect(lastPatch()).toBeDefined());
      const body = lastPatch();
      expect(body.combatants[0].conditions).toEqual(['Poisoned']);
      expect(body.expectedVersion).toBe(4);
    });

    it('removes a condition via the chip ×, keeping the others', async () => {
      route(soloEncounter({ conditions: ['Poisoned', 'Prone'] }));
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Remove Poisoned from Goblin' }));

      await waitFor(() => expect(lastPatch()).toBeDefined());
      expect(lastPatch().combatants[0].conditions).toEqual(['Prone']);
    });

    it('drops the conditions key when the last condition is removed', async () => {
      route(soloEncounter({ conditions: ['Stunned'] }));
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Remove Stunned from Goblin' }));

      await waitFor(() => expect(lastPatch()).toBeDefined());
      expect(lastPatch().combatants[0]).not.toHaveProperty('conditions');
    });

    it('toggles concentration on, then names the spell', async () => {
      route(soloEncounter());
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      await user.click(screen.getByRole('button', { name: 'Toggle concentration for Goblin' }));
      await waitFor(() => expect(lastPatch()?.combatants[0].concentration).toEqual({}));

      // The spell input appears once concentrating; commit on blur.
      const spell = await screen.findByLabelText('Concentration spell for Goblin');
      fireEvent.change(spell, { target: { value: 'Bless' } });
      fireEvent.blur(spell);

      await waitFor(() =>
        expect(lastPatch().combatants[0].concentration).toEqual({ spell: 'Bless' })
      );
    });

    it('renders a concentration chip with the spell name', async () => {
      route(soloEncounter({ concentration: { spell: 'Bless' } }));
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      expect(screen.getByText('Concentrating: Bless')).toBeInTheDocument();
    });

    it('sets an exhaustion level, then clears it back to none', async () => {
      route(soloEncounter({ exhaustion: 2 }));
      const user = userEvent.setup();
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });
      // Scope to the chip span — the <option> labels collide with the chip text.
      expect(screen.getByText('Exhaustion 2', { selector: 'span' })).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText('Exhaustion for Goblin'), 'Exhaustion 5');
      await waitFor(() => expect(lastPatch()?.combatants[0].exhaustion).toBe(5));

      await user.selectOptions(screen.getByLabelText('Exhaustion for Goblin'), 'Exhaustion: none');
      await waitFor(() => expect(lastPatch().combatants[0]).not.toHaveProperty('exhaustion'));
    });

    it('shows condition chips read-only to non-controllers (no edit controls)', async () => {
      mockUseAuth.mockReturnValue({
        user: { userId: 'someone-else', username: 'p', role: 'player' },
        isDm: false,
      });
      route(soloEncounter({ conditions: ['Poisoned'], concentration: { spell: 'Bless' } }));
      render(<InitiativeTrackerPage />);
      await screen.findByRole('heading', { name: /goblin ambush/i });

      expect(screen.getByText('Poisoned')).toBeInTheDocument();
      expect(screen.getByText('Concentrating: Bless')).toBeInTheDocument();
      expect(screen.queryByLabelText('Add condition to Goblin')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Remove Poisoned from Goblin' })
      ).not.toBeInTheDocument();
    });
  });
});
