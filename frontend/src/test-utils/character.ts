import type { Character, ComputedStats } from '@/lib/types';
import { DEFAULT_CHARACTER_STATS_RULES, computeCoreCharacterStats } from '@grimoire-os/shared';

/**
 * Derive a `ComputedStats` block from a character's stored inputs using the
 * same shared formula core the backend's `computeCharacterStats` runs on
 * (VEG-412, VEG-453) — so a fixture's `computed` block is exactly what the real
 * API would return for those stored fields, and can't drift from it.
 *
 * Keeps factory-built characters self-consistent by default: a spec that
 * overrides `abilityScores`/`level`/`savingThrows`/`skills` gets a matching
 * computed block for free. Specs that verify a component reads `computed` (not
 * stored) should pass an explicit divergent `computed` override instead.
 *
 * The rules tables are the shared master copies rather than the seeded rows the
 * backend reads; backend drift guards pin the two together.
 *
 * A null `abilityScores` is left as-is rather than swapped for
 * `DEFAULT_ABILITY_SCORES`: the core treats every missing score as 10, which is
 * what the API returns for such a row. Substituting the display default here
 * would re-open a drift seam the moment that default stopped being all-10.
 *
 * `spellSlots` is always null here — deriving it needs class progression data
 * the frontend doesn't have; caster specs override it explicitly.
 */
export function deriveComputed(
  c: Pick<
    Character,
    | 'level'
    | 'experiencePoints'
    | 'abilityScores'
    | 'savingThrows'
    | 'skills'
    | 'spellcastingAbility'
    | 'armorClass'
    | 'proficiencies'
    | 'inventory'
    | 'weapons'
    | 'exhaustion'
    | 'speed'
  >
): ComputedStats {
  return { ...computeCoreCharacterStats(DEFAULT_CHARACTER_STATS_RULES, c), spellSlots: null };
}

/**
 * Shared Character fixture for component tests. Returns a fully-populated,
 * type-valid `Character` (a level-5 Dwarf Fighter, "Thorin Ironforge") so a spec
 * only has to spell out the fields it actually asserts on.
 *
 * `over` is spread LAST so callers always win — including overriding a field to
 * `null`/`undefined`/`[]` to exercise an empty or legacy-data path. The return
 * type is `Character` without an `as` cast: when the entity gains a new required
 * field, this one factory fails to compile instead of 14 hand-rolled literals.
 *
 * `computed` derives from the merged stored fields unless `over.computed` is
 * supplied — so overrides to stored inputs stay consistent, and regression specs
 * can force a divergent computed block to prove a component reads it.
 */
export function makeCharacter(over: Partial<Character> = {}): Character {
  const stored: Omit<Character, 'computed'> & { computed?: ComputedStats } = {
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
    // Mirrors the backend fixture Fighter: the class weapon strings live on
    // the character row (as the guided builder writes them), so derived
    // weapon rows stay proficient like the real API's class-grant union
    // renders them (VEG-463). Specs exercising non-proficiency override this.
    proficiencies: ['All armor', 'Shields', 'Simple weapons', 'Martial weapons'],
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
  return { ...stored, computed: over.computed ?? deriveComputed(stored) };
}
