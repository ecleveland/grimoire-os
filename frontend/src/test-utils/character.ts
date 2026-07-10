import type { AbilityScores, Character, ComputedSpellcasting, ComputedStats } from '@/lib/types';
// Value import from the file-linked shared package: fine here because tests run
// under Vitest's resolver — app code can't do this (Turbopack limitation, see
// the types.ts header) and must keep getting computed.xp from the API. The
// threshold table is the shared master copy, drift-guarded against the seeded
// rule by a backend test.
import {
  computeXpBand,
  deriveArmorClass,
  deriveWeapons,
  XP_LEVEL_THRESHOLDS,
} from '@grimoire-os/shared';
import {
  ABILITY_KEYS,
  ABILITY_KEY_TO_NAME,
  SKILL_ABILITY_MAP,
  abilityModifier,
  proficiencyBonus,
} from '@/lib/ability-math';
import { DEFAULT_ABILITY_SCORES } from '@/lib/character-defaults';

/**
 * Derive a `ComputedStats` block from a character's stored inputs, mirroring the
 * backend's `computeCharacterStats` (VEG-412). Keeps factory-built characters
 * self-consistent by default: a spec that overrides `abilityScores`/`level`/
 * `savingThrows`/`skills` gets a matching computed block for free. Specs that
 * verify a component reads `computed` (not stored) should pass an explicit
 * divergent `computed` override instead.
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
    | 'inventory'
    | 'weapons'
  >
): ComputedStats {
  const scores = c.abilityScores ?? DEFAULT_ABILITY_SCORES;
  const prof = proficiencyBonus(c.level);

  const abilityModifiers = Object.fromEntries(
    ABILITY_KEYS.map(key => [key, abilityModifier(scores[key])])
  ) as ComputedStats['abilityModifiers'];

  const savingThrows = Object.fromEntries(
    ABILITY_KEYS.map(key => {
      const name = ABILITY_KEY_TO_NAME[key];
      const proficient = c.savingThrows.includes(name);
      return [name, { proficient, bonus: abilityModifiers[key] + (proficient ? prof : 0) }];
    })
  );

  const skills = Object.fromEntries(
    Object.entries(SKILL_ABILITY_MAP).map(([skill, ability]) => {
      const key = ability.toLowerCase() as keyof AbilityScores;
      const proficient = c.skills.includes(skill);
      return [
        skill,
        { ability, proficient, bonus: abilityModifiers[key] + (proficient ? prof : 0) },
      ];
    })
  );

  let spellcasting: ComputedSpellcasting | null = null;
  if (c.spellcastingAbility) {
    const key = c.spellcastingAbility.toLowerCase() as keyof AbilityScores;
    const mod = ABILITY_KEYS.includes(key) ? abilityModifiers[key] : 0;
    spellcasting = {
      ability: c.spellcastingAbility,
      modifier: mod,
      saveDC: 8 + prof + mod,
      attackBonus: prof + mod,
    };
  }

  return {
    proficiencyBonus: prof,
    abilityModifiers,
    initiative: abilityModifiers.dexterity,
    savingThrows,
    skills,
    passivePerception: 10 + skills['Perception'].bonus,
    spellcasting,
    spellSlots: null,
    xp: computeXpBand(XP_LEVEL_THRESHOLDS, c.level, c.experiencePoints),
    // Same shared derivations the backend compute layer uses (VEG-410), so
    // fixture AC/weapons stay consistent with stored inventory/armorClass.
    armorClass: deriveArmorClass(c.inventory ?? [], abilityModifiers.dexterity, c.armorClass),
    weapons: deriveWeapons(c.inventory ?? [], abilityModifiers, prof, c.weapons ?? []),
  };
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
  return { ...stored, computed: over.computed ?? deriveComputed(stored) };
}
