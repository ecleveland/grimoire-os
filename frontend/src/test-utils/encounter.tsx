import type { Mock } from 'vitest';
import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import type { Encounter, Combatant, PartyCharacter, SrdMonster } from '@/lib/types';
import type { CombatantLoot } from '@grimoire-os/shared';

// Fixtures and request routers shared by the encounter tracker specs. Each
// router takes the spec file's own `apiFetch` mock, because vi.mock is per file.

export function makeCombatant(over: Partial<Combatant> = {}): Combatant {
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

export const goblinMonster: SrdMonster = {
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
  contentSource: 'srd',
};

export function makeLoot(over: Partial<CombatantLoot> = {}): CombatantLoot {
  return {
    coinage: { gp: 2, sp: 5, cp: 10 },
    items: [{ itemId: 'item-1', name: 'Dagger', quantity: 1, source: 'monster' }],
    rolledAt: '2026-06-10T00:00:00.000Z',
    ...over,
  };
}

export function makeEncounter(over: Partial<Encounter> = {}): Encounter {
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

/**
 * Routes the encounter GET/PATCH and the SRD monster search/detail endpoints
 * for the "add monster from lookup" integration flow. `onPatch` lets a test
 * decide how the PATCH resolves (e.g. reject with a 409).
 */
export function routeAddFlow(
  mockApiFetch: Mock,
  opts: {
    encounter: Encounter;
    onPatch?: (body: unknown) => Promise<unknown>;
    characters?: PartyCharacter[] | (() => Promise<PartyCharacter[]>);
  }
) {
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

export async function addGoblinFromLookup(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: /goblin ambush/i });
  await user.type(screen.getByPlaceholderText(/search monsters/i), 'goblin');
  await user.click(await screen.findByTestId('lookup-result'));
  await screen.findByText('Nimble Escape.'); // stat block loaded
  await user.click(screen.getByRole('button', { name: /add to encounter/i })); // CTA
  await user.click(screen.getByRole('button', { name: /add to encounter/i })); // dialog confirm
}

/**
 * Routes the encounter GET, the loot POST, and the PATCH used by HP
 * commits. The default loot roll mirrors the backend: every monster-linked
 * combatant (or just `combatantIndex`) gets `makeLoot()`, version bumps.
 */
export function routeLootFlow(
  mockApiFetch: Mock,
  opts: {
    encounter: Encounter;
    onRoll?: (body: { combatantIndex?: number; expectedVersion?: number }) => Promise<unknown>;
    onPatch?: (body: { combatants?: Combatant[]; expectedVersion?: number }) => Promise<unknown>;
  }
) {
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

/** Routes the encounter GET, the combatants PATCH, and the loot POST. */
export function routeHpControls(
  mockApiFetch: Mock,
  opts: {
    encounter: Encounter;
    onPatch?: (body: { combatants?: Combatant[]; expectedVersion?: number }) => Promise<unknown>;
    onRoll?: (body: { combatantIndex?: number; expectedVersion?: number }) => Promise<unknown>;
  }
) {
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

// jsdom has no matchMedia, so the tracker's useMediaQuery reads "narrow".
// stubWide opts a test into the wide layout; the caller removes the stub in
// afterEach.
export function stubWide(matches = true) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
