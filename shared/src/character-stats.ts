// ── Character-stat formula core (VEG-453) ──────────────────────────────
//
// The single implementation of the 5e stat formulas — ability modifiers,
// proficiency bonus, save/skill bonuses, passive perception, spellcasting
// save DC / attack bonus — plus the derivations already living in this package
// (AC, weapons, XP band, exhaustion, speed) assembled into one block.
//
// Three call sites previously mirrored this math (VEG-453): the backend compute
// layer, the frontend guided-builder previews, and the frontend test factory.
// The mirrors drifted silently whenever a formula or a seeded rule changed —
// component specs kept passing against `computed` blocks the real API would
// never produce. Now all three call `computeCoreCharacterStats`.
//
// The rules *tables* stay parameters rather than hardcoded constants so the
// backend keeps reading the seeded `game_rules` rows (the authority). The
// master copies below serve consumers with no database access; backend drift
// guards pin the seeded rules to them, the same arrangement `XP_LEVEL_THRESHOLDS`
// and `EXHAUSTION_RULE` already use in ./computed.

import type {
  CarryingCapacityRule,
  ComputedAbilityModifiers,
  ComputedExhaustion,
  ComputedSave,
  ComputedSkill,
  ComputedSpellcasting,
  ComputedStats,
  ExhaustionRule,
} from './computed';
import {
  CARRYING_CAPACITY_RULE,
  EXHAUSTION_RULE,
  XP_LEVEL_THRESHOLDS,
  computeEncumbrance,
  computeExhaustionEffect,
  computeXpBand,
  resolveInitiative,
  resolveSpeed,
} from './computed';
import type { AbilityScores, InventoryItem, Weapon } from './embedded';
import { abilityModifier, deriveArmorClass, deriveWeapons } from './gear';

// ── Ability identity ───────────────────────────────────────────────────

/**
 * The six abilities by full name, as they're stored on a character row.
 *
 * Frozen for the same reason as {@link SKILL_NAMES}: the backend hands this to
 * `@IsIn`, which retains the array by reference in class-validator's global
 * metadata for the process lifetime. `as const` is erased at compile time and
 * so guards nothing at runtime — without the freeze, one `push` anywhere would
 * silently widen the saving-throw write boundary for every subsequent request.
 */
export const ABILITY_NAMES = Object.freeze([
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
] as const);

export type AbilityName = (typeof ABILITY_NAMES)[number];

/** The six abilities as {@link AbilityScores} keys, in canonical order. */
export const ABILITY_KEYS: readonly (keyof AbilityScores)[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

/** Key → full name, the form `savingThrows` and `spellcastingAbility` store. */
export const ABILITY_NAME_BY_KEY: Readonly<Record<keyof AbilityScores, AbilityName>> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

/** Full name → key, or null when the string doesn't name an ability. */
export function abilityKeyFromName(name: string): keyof AbilityScores | null {
  const key = name.toLowerCase() as keyof AbilityScores;
  return ABILITY_KEYS.includes(key) ? key : null;
}

/**
 * Whether a string names one of the six abilities. The characters service uses
 * this to flag a corrupt/typo'd `spellcastingAbility` column (free-form text)
 * rather than letting it silently produce a wrong save DC (VEG-346).
 */
export function isKnownAbilityName(name: string): boolean {
  return abilityKeyFromName(name) !== null;
}

// ── Rule data (master copies) ──────────────────────────────────────────

/**
 * SRD proficiency bonus by level, keyed '1'–'20'. Master copy for consumers
 * with no seeded-rules access; the seeded `proficiency-bonus/table` rule
 * carries the same numbers and a backend drift-guard test pins the two
 * together — the same arrangement as {@link XP_LEVEL_THRESHOLDS}.
 */
export const PROFICIENCY_BONUS_TABLE: Readonly<Record<string, number>> = {
  '1': 2,
  '2': 2,
  '3': 2,
  '4': 2,
  '5': 3,
  '6': 3,
  '7': 3,
  '8': 3,
  '9': 4,
  '10': 4,
  '11': 4,
  '12': 4,
  '13': 5,
  '14': 5,
  '15': 5,
  '16': 5,
  '17': 6,
  '18': 6,
  '19': 6,
  '20': 6,
};

/**
 * The 18 SRD skills and their governing abilities. Master copy: the seeded
 * `skills/ability-mappings` rule and the `srdSkills` catalog carry the same
 * pairs, and backend drift guards pin both to this.
 *
 * Insertion order is significant — it drives the key order of
 * `ComputedStats.skills`, and the frontend's `SKILLS` constant is this map's
 * projection. Grouped by ability, matching the seeded rule. That order survives
 * only because no skill name is an integer-like string: JS orders integer-like
 * keys numerically ahead of insertion order, which is why the same claim would
 * be false for {@link PROFICIENCY_BONUS_TABLE} and why nothing depends on its
 * key order. Two tests pin this map's order — a type can't express it.
 */
export const SKILL_ABILITY_MAP: Readonly<Record<string, AbilityName>> = {
  Athletics: 'Strength',
  Acrobatics: 'Dexterity',
  'Sleight of Hand': 'Dexterity',
  Stealth: 'Dexterity',
  Arcana: 'Intelligence',
  History: 'Intelligence',
  Investigation: 'Intelligence',
  Nature: 'Intelligence',
  Religion: 'Intelligence',
  'Animal Handling': 'Wisdom',
  Insight: 'Wisdom',
  Medicine: 'Wisdom',
  Perception: 'Wisdom',
  Survival: 'Wisdom',
  Deception: 'Charisma',
  Intimidation: 'Charisma',
  Performance: 'Charisma',
  Persuasion: 'Charisma',
};

/**
 * The 18 SRD skill names, in {@link SKILL_ABILITY_MAP} order.
 *
 * Derived rather than re-typed, so the write-boundary guards that reject
 * unknown skill names (VEG-493) and the seed drift guards (VEG-492) pin against
 * the same master copy.
 *
 * Frozen as well as `readonly`: the backend hands this array to `@IsIn`, which
 * retains it in validation metadata for the process lifetime, so a mutation
 * anywhere would silently widen every write boundary at once. `readonly` only
 * stops that at compile time, and not at all for a JS caller.
 */
export const SKILL_NAMES: readonly string[] = Object.freeze(Object.keys(SKILL_ABILITY_MAP));

/**
 * The rules tables the stat core reads.
 *
 * The two level-keyed tables are `Partial` because that is the truth: they
 * arrive as untyped seeded JSON, and both lookups throw on a missing row. A
 * total `Record` would type those guards as unreachable and let a future
 * consumer index the table without handling the gap.
 */
export interface CharacterStatsRules {
  /** Level (as a string key, '1'–'20') → proficiency bonus. */
  proficiencyBonusTable: Readonly<Partial<Record<string, number>>>;
  /** Skill name → governing ability full name. Values stay `string` rather than
   * {@link AbilityName}: the backend passes seeded JSON, and a corrupt row must
   * degrade to a 0 modifier (see `computeCoreCharacterStats`) rather than be
   * cast into a lie. */
  skillAbilityMap: Readonly<Record<string, string>>;
  /** Level (as a string key, '1'–'20') → XP required to reach it. */
  xpThresholds: Readonly<Partial<Record<string, number>>>;
  /** Per-level exhaustion scaling factors. */
  exhaustion: ExhaustionRule;
  /** Carry thresholds, speed penalties and size multipliers (VEG-490). */
  carryingCapacity: CarryingCapacityRule;
}

/**
 * The master copies bundled, for consumers with no seeded-rules access — the
 * guided-builder previews and the frontend test factory. The backend passes the
 * seeded rows instead, so the database stays the authority there.
 */
export const DEFAULT_CHARACTER_STATS_RULES: CharacterStatsRules = {
  proficiencyBonusTable: PROFICIENCY_BONUS_TABLE,
  skillAbilityMap: SKILL_ABILITY_MAP,
  xpThresholds: XP_LEVEL_THRESHOLDS,
  exhaustion: EXHAUSTION_RULE,
  carryingCapacity: CARRYING_CAPACITY_RULE,
};

// ── Primitive formulas ─────────────────────────────────────────────────

/** Levels outside 1–20 clamp to the nearest valid level for table lookups. */
function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(20, Math.max(1, Math.floor(level)));
}

/**
 * Proficiency bonus for a level (SRD: ceil(level/4)+1), read from the table
 * rather than computed so the seeded rule stays the authority. Levels outside
 * 1–20 clamp, like the other table lookups.
 *
 * A table missing the clamped level throws: a sparse table would otherwise
 * surface as a silent `NaN` propagating into every save, skill and attack
 * bonus — the same failure mode {@link computeXpBand} guards against.
 */
export function proficiencyBonusFrom(
  table: Readonly<Partial<Record<string, number>>>,
  level: number
): number {
  const lvl = clampLevel(level);
  const bonus = table[String(lvl)];
  if (bonus === undefined) {
    throw new Error(`Proficiency bonus table is missing the level-${lvl} row`);
  }
  return bonus;
}

/** A missing ability score is treated as 10 (modifier 0). */
function scoreFor(abilityScores: AbilityScores | null | undefined, key: keyof AbilityScores) {
  return abilityScores?.[key] ?? 10;
}

// ── Core stat block ────────────────────────────────────────────────────

/**
 * The stored character fields the stat core reads. Keeping this narrow (rather
 * than taking a full row) makes the formulas pure and trivially unit-testable,
 * and documents exactly which inputs drive derived values (VEG-346).
 *
 * The optional/nullable fields mirror how a deserialized `Character` actually
 * arrives: nullable JSON columns come back `null`, and columns the client never
 * sent are `undefined` (VEG-425). Accepting both means a `Character` can be
 * passed straight in. Callers that *should* be forced to supply a field — the
 * backend compute layer, which reads a full Prisma row — narrow it back to
 * required on their own input type.
 */
export interface CharacterStatsInput {
  level: number;
  experiencePoints: number;
  abilityScores: AbilityScores | null;
  /** Ability full names the character is proficient in (e.g. "Strength"). */
  savingThrows: string[];
  /** Skill names the character is proficient in (e.g. "Athletics"). */
  skills: string[];
  /** Explicit spellcasting ability (full name); overrides the class default. */
  spellcastingAbility?: string | null;
  /** Stored AC column — the manual override the derived AC yields to (VEG-410). */
  armorClass?: number | null;
  /**
   * Stored initiative column — a flat *bonus* added on top of the Dexterity
   * modifier (VEG-452), not an override. See {@link ComputedInitiative}.
   *
   * Required (though nullable) on purpose: `Character.initiative` is a
   * required-nullable key, so a whole Character still assigns cleanly, while a
   * caller that narrows via Pick — `deriveComputed` in the frontend test utils
   * is the one that exists — fails to compile instead of silently dropping the
   * bonus from every fixture it builds.
   */
  initiative: number | null;
  /** The character's own proficiency strings (weapon/tool, free text). */
  proficiencies?: string[] | null;
  /** Inventory rows; equipped items with gear metadata drive AC/weapons (VEG-410). */
  inventory?: InventoryItem[] | null;
  /** Stored manual weapon rows; a same-named equipped weapon derives no duplicate. */
  weapons?: Weapon[] | null;
  /** Exhaustion level 1–6, penalizing d20 Tests and Speed (VEG-449). */
  exhaustion?: number | null;
  /** Stored walking speed in feet; null falls back to `DEFAULT_SPEED`. */
  speed?: number | null;
  /** Creature size, scaling the carry thresholds (VEG-490). Free text
   * server-side, so an unrecognized value falls back to the ×1 multiplier. */
  size?: string | null;
}

/**
 * Class-catalog data the caller resolves, unioned with the character's own
 * stored values here so the grant semantics stay in the pure core (VEG-463).
 * Callers with no class catalog (the builder previews, test fixtures) omit it.
 */
export interface CharacterStatsGrants {
  /**
   * Class *default* spellcasting ability — named for its precedence: the
   * character's own `spellcastingAbility` column wins whenever it's set (which
   * is what lets a subclass caster like an Eldritch Knight override the class).
   */
  defaultSpellcastingAbility?: string | null;
  /** Class weapon proficiencies, unioned with the character's own list. */
  weaponProficiencies?: string[];
}

/**
 * Derive a character's stats from its stored inputs. Pure: the same inputs
 * always yield the same block, so editing an ability score changes every
 * dependent value with no separate write (VEG-346).
 *
 * Returns everything in {@link ComputedStats} except `spellSlots`, which needs
 * the class catalog's slot progression and is layered on by the backend compute
 * layer. Callers without that data (builder previews, fixtures) supply `null`.
 */
export function computeCoreCharacterStats(
  rules: CharacterStatsRules,
  input: CharacterStatsInput,
  grants: CharacterStatsGrants = {}
): Omit<ComputedStats, 'spellSlots'> {
  const {
    level,
    experiencePoints,
    abilityScores,
    savingThrows,
    skills,
    spellcastingAbility,
    armorClass,
    initiative,
    proficiencies,
    inventory,
    weapons,
    exhaustion: exhaustionLevel,
    speed,
    size,
  } = input;
  const profBonus = proficiencyBonusFrom(rules.proficiencyBonusTable, level);

  // Exhaustion reduces every d20 Test (SRD 5.2, VEG-449). It is folded into each
  // derived roll bonus below exactly once — `passivePerception` and the derived
  // weapon rows inherit it from the values they're built on rather than adding
  // it again. Ability modifiers, the spell save DC and AC are deliberately
  // untouched: none of them is a d20 Test the character rolls.
  const exhaustion: ComputedExhaustion | null = computeExhaustionEffect(
    rules.exhaustion,
    exhaustionLevel
  );
  const d20Penalty = exhaustion?.d20Penalty ?? 0;

  const abilityModifiers = {} as ComputedAbilityModifiers;
  const abilityChecks = {} as ComputedAbilityModifiers;
  for (const key of ABILITY_KEYS) {
    abilityModifiers[key] = abilityModifier(scoreFor(abilityScores, key));
    // A bare ability check is a d20 Test, so it takes the penalty — unlike the
    // modifier itself, which feeds HP math and must stay raw.
    abilityChecks[key] = abilityModifiers[key] + d20Penalty;
  }

  const savingThrowBonuses: Record<string, ComputedSave> = {};
  for (const key of ABILITY_KEYS) {
    const name = ABILITY_NAME_BY_KEY[key];
    const proficient = savingThrows.includes(name);
    savingThrowBonuses[name] = {
      proficient,
      bonus: abilityModifiers[key] + (proficient ? profBonus : 0) + d20Penalty,
    };
  }

  const skillBonuses: Record<string, ComputedSkill> = {};
  for (const [skill, ability] of Object.entries(rules.skillAbilityMap)) {
    const key = abilityKeyFromName(ability);
    const mod = key ? abilityModifiers[key] : 0;
    const proficient = skills.includes(skill);
    skillBonuses[skill] = {
      ability,
      proficient,
      bonus: mod + (proficient ? profBonus : 0) + d20Penalty,
    };
  }

  // A rules table without Perception would otherwise yield NaN here; the
  // backend drift guards keep the seeded map complete, but a homebrew table
  // reaching this far should degrade to the bare 10 rather than render NaN.
  const passivePerception = 10 + (skillBonuses['Perception']?.bonus ?? 0);

  // Spellcasting ability: an explicit column wins (covers subclass casters like
  // Eldritch Knight), else fall back to the class default. Null → non-caster.
  // An unrecognized name (corrupt column) yields modifier 0; the service logs
  // it so the wrong-but-rendered DC is observable rather than silent.
  const resolvedAbility = spellcastingAbility ?? grants.defaultSpellcastingAbility ?? null;
  let spellcasting: ComputedSpellcasting | null = null;
  if (resolvedAbility) {
    const key = abilityKeyFromName(resolvedAbility);
    const mod = key ? abilityModifiers[key] : 0;
    spellcasting = {
      ability: resolvedAbility,
      modifier: mod,
      // The save DC is a static number the *target* rolls against, not a d20
      // Test the caster makes, so exhaustion leaves it alone. The spell attack
      // bonus is a roll, so it takes the penalty.
      saveDC: 8 + profBonus + mod,
      attackBonus: profBonus + mod + d20Penalty,
    };
  }

  const items = inventory ?? [];

  // Carrying state (VEG-490). Reads the raw Strength *score*, not its modifier —
  // 5e capacity is Strength × 15. `scoreFor` supplies the neutral 10 for a
  // character with no stored ability scores, so a minimal sheet reads as
  // unencumbered instead of over a capacity of 0.
  const encumbrance = computeEncumbrance(
    rules.carryingCapacity,
    scoreFor(abilityScores, 'strength'),
    size,
    items
  );

  return {
    proficiencyBonus: profBonus,
    abilityModifiers,
    abilityChecks,
    initiative: resolveInitiative(initiative, abilityModifiers.dexterity, exhaustion),
    savingThrows: savingThrowBonuses,
    skills: skillBonuses,
    passivePerception,
    spellcasting,
    xp: computeXpBand(rules.xpThresholds, level, experiencePoints),
    // An absent column reads the same as a cleared one: no manual override.
    armorClass: deriveArmorClass(items, abilityModifiers.dexterity, armorClass ?? null),
    weapons: deriveWeapons(
      items,
      abilityModifiers,
      profBonus,
      [...(grants.weaponProficiencies ?? []), ...(proficiencies ?? [])],
      weapons ?? [],
      d20Penalty
    ),
    speed: resolveSpeed(speed, exhaustion, encumbrance),
    exhaustion,
    encumbrance,
  };
}
