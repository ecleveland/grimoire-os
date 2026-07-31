// ── Computed character stats (VEG-346) ─────────────────────────────────
//
// The backend derives these from a character's stored fields (ability scores,
// level, proficiencies, class spellcasting) on every read, so they can never
// drift from the inputs the way the persisted `initiative`/`spellSaveDC`/
// `spellAttackBonus` columns did. The display sheet consumes this block instead
// of recomputing locally. Formulas mirror the M10 `game_rules` source.

import type { AbilityScores, ArmorType, Weapon } from './embedded';

/** Per-ability modifiers, keyed exactly like {@link AbilityScores}. */
export type ComputedAbilityModifiers = Record<keyof AbilityScores, number>;

/** A single skill's derived bonus plus the inputs that produced it. */
export interface ComputedSkill {
  /** Governing ability, full name (e.g. "Dexterity"). */
  ability: string;
  /** Ability modifier + proficiency bonus when proficient. */
  bonus: number;
  proficient: boolean;
}

/** A single saving throw's derived bonus. */
export interface ComputedSave {
  /** Ability modifier + proficiency bonus when proficient. */
  bonus: number;
  proficient: boolean;
}

/** Caster category, which selects the slot-progression table. */
export type SpellcasterType = 'full' | 'half' | 'pact';

export interface ComputedSpellSlots {
  caster: SpellcasterType;
  /** Slot level → maximum slots available at the character's level. */
  maxByLevel: Record<number, number>;
}

/**
 * Derived spellcasting numbers, present as a unit only for casters. Grouping
 * the four fields makes the "all set or all absent" invariant unrepresentable
 * as four independent nulls (VEG-346).
 */
export interface ComputedSpellcasting {
  /** Resolved spellcasting ability, full name (e.g. "Wisdom"). */
  ability: string;
  /** Modifier of the spellcasting ability. */
  modifier: number;
  /** 8 + proficiency bonus + spellcasting modifier. */
  saveDC: number;
  /** Proficiency bonus + spellcasting modifier. */
  attackBonus: number;
}

/**
 * XP position within the current level's band, derived from the seeded
 * level-threshold table (VEG-411). Advisory only — leveling is never gated on
 * it, so milestone campaigns can level with XP untouched.
 */
export interface ComputedXp {
  /** XP required to have reached the current level. */
  currentLevelAt: number;
  /** XP required for the next level, or null at level 20. */
  nextLevelAt: number | null;
  /** XP earned past `currentLevelAt`, clamped to ≥ 0. */
  into: number;
  /** Band width (`nextLevelAt - currentLevelAt`), or null at level 20. */
  span: number | null;
  /** True when XP meets `nextLevelAt`; always false at level 20. */
  readyToLevel: boolean;
}

/**
 * Postgres int4 ceiling for stored `experiencePoints`: the write boundary (DTO
 * `@Max`) and the sheet's Award XP control both enforce this one constant.
 */
export const MAX_EXPERIENCE_POINTS = 2_147_483_647;

/**
 * SRD XP required to reach each level, keyed '1'–'20'. Master copy for the
 * frontend test fixtures; the seeded `experience-points/level-thresholds` rule
 * carries the same data and a backend drift-guard test pins the two together.
 */
export const XP_LEVEL_THRESHOLDS: Readonly<Record<string, number>> = {
  '1': 0,
  '2': 300,
  '3': 900,
  '4': 2700,
  '5': 6500,
  '6': 14000,
  '7': 23000,
  '8': 34000,
  '9': 48000,
  '10': 64000,
  '11': 85000,
  '12': 100000,
  '13': 120000,
  '14': 140000,
  '15': 165000,
  '16': 195000,
  '17': 225000,
  '18': 265000,
  '19': 305000,
  '20': 355000,
};

/**
 * Pure XP band math shared by the backend compute layer and test fixtures, so
 * the derivation exists once and only the threshold *data* is ever mirrored.
 * `thresholds` maps level (as a string key, '1'–'20') to the XP required to
 * reach it and must cover that full range; out-of-range levels clamp to 1–20
 * like the other table lookups.
 */
export function computeXpBand(
  thresholds: Readonly<Partial<Record<string, number>>>,
  level: number,
  experiencePoints: number
): ComputedXp {
  const lvl = Number.isFinite(level) ? Math.min(20, Math.max(1, Math.floor(level))) : 1;
  const currentLevelAt = thresholds[String(lvl)];
  const nextLevelAt = lvl >= 20 ? null : thresholds[String(lvl + 1)];
  // A sparse table would otherwise surface as a silent NaN band downstream.
  if (currentLevelAt === undefined || nextLevelAt === undefined) {
    throw new Error(`XP threshold table is missing the level-${lvl} band`);
  }
  return {
    currentLevelAt,
    nextLevelAt,
    into: Math.max(0, experiencePoints - currentLevelAt),
    span: nextLevelAt === null ? null : nextLevelAt - currentLevelAt,
    readyToLevel: nextLevelAt !== null && experiencePoints >= nextLevelAt,
  };
}

/**
 * How the derived AC was assembled (VEG-410): the winning body armor's base
 * (or 10 unarmored), the Dex actually applied after the armor type's cap, and
 * the shield bonus. Lets the sheet render "13 + 2 Dex + 2 shield" without
 * re-deriving.
 */
export interface ComputedArmorClassBreakdown {
  base: number;
  dexApplied: number;
  shield: number;
  armorType: ArmorType | 'unarmored';
}

/**
 * Derived armor class (VEG-410). `derived` comes from equipped armor + shield
 * (+ Dex per armor type) and always exists (unarmored fallback = 10 + Dex);
 * `override` mirrors the stored `Character.armorClass` column, which wins when
 * set so homebrew/unarmored-defense builds keep working; `effective` is what
 * the sheet displays.
 */
export interface ComputedArmorClass {
  derived: number;
  override: number | null;
  effective: number;
  breakdown: ComputedArmorClassBreakdown;
}

/**
 * Default walking speed (ft) for a character with no stored `speed`. Mastered
 * here beside {@link resolveSpeed}, which applies it, so the computed block
 * never reports a null base. `frontend/src/lib/character-defaults` keeps a
 * local mirror — app code can't value-import this package under Turbopack — and
 * a frontend spec pins the two together.
 */
export const DEFAULT_SPEED = 30;

/**
 * Walking speed after derived penalties (VEG-449). `base` is the stored column
 * (or {@link DEFAULT_SPEED}), `penalty` is the total reduction in feet, and
 * `effective` is what the sheet displays — floored at 0, since a creature never
 * has negative speed.
 *
 * Exhaustion is the only penalty folded in today; the inventory section applies
 * its encumbrance reduction separately, client-side.
 */
export interface ComputedSpeed {
  base: number;
  penalty: number;
  effective: number;
}

/**
 * Mechanical effect of the Exhaustion condition (VEG-449), present only while
 * the character is exhausted — `null` is "no exhaustion", so a consumer can't
 * mistake an inert level-0 block for an active penalty.
 *
 * SRD 5.2: a D20 Test is reduced by 2 × level and Speed by 5 ft × level; level
 * 6 is death. Derived from the seeded `exhaustion/levels` rule, not hardcoded.
 */
export interface ComputedExhaustion {
  /** Current level, 1–6 (a stored 0/null yields no block at all). */
  level: number;
  /** Reduction applied to every d20 Test, as a negative number (e.g. -6). */
  d20Penalty: number;
  /** Speed reduction in feet, as a positive magnitude (e.g. 15). */
  speedPenalty: number;
  /** Level 6 means death. Advisory only — nothing auto-kills the character. */
  dead: boolean;
}

/** The per-level scaling factors the exhaustion derivation needs. */
export interface ExhaustionRule {
  maxLevel: number;
  d20PenaltyPerLevel: number;
  speedPenaltyFeetPerLevel: number;
}

/**
 * SRD 5.2 exhaustion scaling. Master copy for the frontend test fixtures; the
 * seeded `exhaustion/levels` rule carries the same numbers and a backend
 * drift-guard test pins the two together — the same arrangement as
 * {@link XP_LEVEL_THRESHOLDS}.
 */
export const EXHAUSTION_RULE: Readonly<ExhaustionRule> = {
  maxLevel: 6,
  d20PenaltyPerLevel: 2,
  speedPenaltyFeetPerLevel: 5,
};

/**
 * Resolve the active exhaustion effect, or `null` when the character isn't
 * exhausted (VEG-449). Pure math shared by the backend compute layer (which
 * passes the seeded rule) and the frontend test fixtures (which pass
 * {@link EXHAUSTION_RULE}), so the derivation exists once and only the rule
 * *data* is ever mirrored.
 *
 * A stored `0` and a stored `null` both mean "not exhausted" — the sheet's
 * track normalizes a cleared level to null, but rows written before that
 * convention (and the encounter tracker's 0) must read the same way. Levels past
 * the rule's maximum clamp rather than scaling beyond death, matching how the
 * other table lookups treat out-of-range input; a fractional level floors.
 */
export function computeExhaustionEffect(
  rule: ExhaustionRule,
  level: number | null | undefined
): ComputedExhaustion | null {
  if (!level || !Number.isFinite(level) || level < 1) return null;
  const lvl = Math.min(rule.maxLevel, Math.floor(level));
  return {
    level: lvl,
    d20Penalty: -(rule.d20PenaltyPerLevel * lvl),
    speedPenalty: rule.speedPenaltyFeetPerLevel * lvl,
    dead: lvl >= rule.maxLevel,
  };
}

/**
 * Walking speed after the exhaustion reduction; never negative.
 * `speed` is the stored column, falling back to {@link DEFAULT_SPEED}.
 */
export function resolveSpeed(
  speed: number | null | undefined,
  exhaustion: ComputedExhaustion | null
): ComputedSpeed {
  const base = speed ?? DEFAULT_SPEED;
  const penalty = exhaustion?.speedPenalty ?? 0;
  return { base, penalty, effective: Math.max(0, base - penalty) };
}

/**
 * Authoritative derived values for a character. Everything here is a pure
 * function of the character's stored inputs — recomputed per read, never
 * persisted. Spellcasting fields are null for non-casters.
 */
export interface ComputedStats {
  /** Proficiency bonus for the character's level (clamped to 1–20). */
  proficiencyBonus: number;
  /**
   * Raw ability modifiers. Deliberately *not* reduced by exhaustion (VEG-449):
   * the penalty applies to a d20 Test's roll, not to the modifier itself, and
   * the level-up / short-rest HP math reads these for the CON modifier.
   *
   * For the bonus to a bare ability *check*, use {@link ComputedStats.abilityChecks}.
   */
  abilityModifiers: ComputedAbilityModifiers;
  /**
   * Bonus for a bare ability check — the ability modifier less any exhaustion
   * penalty (VEG-449). Separate from {@link ComputedStats.abilityModifiers}
   * because an ability check *is* a d20 Test and takes the penalty, while the
   * modifier feeding HP math is not and must not.
   */
  abilityChecks: ComputedAbilityModifiers;
  /** Initiative = Dexterity modifier, less any exhaustion penalty. */
  initiative: number;
  /** Keyed by ability full name (e.g. "Strength"); exhaustion-adjusted. */
  savingThrows: Record<string, ComputedSave>;
  /** Keyed by skill name (e.g. "Athletics"); exhaustion-adjusted. */
  skills: Record<string, ComputedSkill>;
  /** 10 + the (already exhaustion-adjusted) Perception skill bonus. */
  passivePerception: number;
  /** Spell save DC / attack bonus / modifier, or null for non-casters. */
  spellcasting: ComputedSpellcasting | null;
  /** Max spell slots per level from the class progression, or null. */
  spellSlots: ComputedSpellSlots | null;
  /** XP progress within the current level's threshold band. */
  xp: ComputedXp;
  /** AC from equipped gear, with the stored column as manual override (VEG-410). */
  armorClass: ComputedArmorClass;
  /** Attack rows derived from equipped weapons (VEG-410); manual `Character.weapons` entries are separate. */
  weapons: Weapon[];
  /** Walking speed after derived penalties (VEG-449). */
  speed: ComputedSpeed;
  /** Active exhaustion effect, or null when the character isn't exhausted. */
  exhaustion: ComputedExhaustion | null;
}
