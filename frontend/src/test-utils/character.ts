import type { Character } from '@/lib/types';

/**
 * Shared Character fixture for component tests. Returns a fully-populated,
 * type-valid `Character` (a level-5 Dwarf Fighter, "Thorin Ironforge") so a spec
 * only has to spell out the fields it actually asserts on.
 *
 * `over` is spread LAST so callers always win — including overriding a field to
 * `null`/`undefined`/`[]` to exercise an empty or legacy-data path. The return
 * type is `Character` without an `as` cast: when the entity gains a new required
 * field, this one factory fails to compile instead of 14 hand-rolled literals.
 */
export function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: 'char-1',
    userId: 'user-1',
    name: 'Thorin Ironforge',
    race: 'Dwarf',
    class: 'Fighter',
    level: 5,
    subclass: 'Champion',
    background: 'Soldier',
    alignment: 'Lawful Good',
    experiencePoints: 6500,
    abilityScores: {
      strength: 16,
      dexterity: 12,
      constitution: 14,
      intelligence: 10,
      wisdom: 13,
      charisma: 8,
    },
    hitPoints: { max: 44, current: 32, temporary: 5 },
    deathSaves: { successes: 2, failures: 1 },
    armorClass: 18,
    speed: 25,
    initiative: 1,
    proficiencies: [],
    languages: [],
    savingThrows: [],
    skills: [],
    spells: [],
    attunedItems: [],
    spellSlots: [],
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    features: [],
    hitDice: { dieType: 'd10', total: 8, spent: 3 },
    conditions: [],
    concentration: null,
    exhaustion: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}
