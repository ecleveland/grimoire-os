// ── Computed character stats (VEG-346) ─────────────────────────────────
//
// The backend derives these from a character's stored fields (ability scores,
// level, proficiencies, class spellcasting) on every read, so they can never
// drift from the inputs the way the persisted `initiative`/`spellSaveDC`/
// `spellAttackBonus` columns did. The display sheet consumes this block instead
// of recomputing locally. Formulas mirror the M10 `game_rules` source.

import type { AbilityScores } from './embedded';

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
 * Pure XP band math shared by the backend compute layer and test fixtures, so
 * the derivation exists once and only the threshold *data* is ever mirrored.
 * `thresholds` maps level (as a string key, '1'–'20') to the XP required to
 * reach it; out-of-range levels clamp to 1–20 like the other table lookups.
 */
export function computeXpBand(
  thresholds: Readonly<Record<string, number>>,
  level: number,
  experiencePoints: number
): ComputedXp {
  const lvl = Number.isFinite(level) ? Math.min(20, Math.max(1, Math.floor(level))) : 1;
  const currentLevelAt = thresholds[String(lvl)];
  const nextLevelAt = lvl >= 20 ? null : thresholds[String(lvl + 1)];
  return {
    currentLevelAt,
    nextLevelAt,
    into: Math.max(0, experiencePoints - currentLevelAt),
    span: nextLevelAt === null ? null : nextLevelAt - currentLevelAt,
    readyToLevel: nextLevelAt !== null && experiencePoints >= nextLevelAt,
  };
}

/**
 * Authoritative derived values for a character. Everything here is a pure
 * function of the character's stored inputs — recomputed per read, never
 * persisted. Spellcasting fields are null for non-casters.
 */
export interface ComputedStats {
  /** Proficiency bonus for the character's level (clamped to 1–20). */
  proficiencyBonus: number;
  abilityModifiers: ComputedAbilityModifiers;
  /** Initiative = Dexterity modifier. */
  initiative: number;
  /** Keyed by ability full name (e.g. "Strength"). */
  savingThrows: Record<string, ComputedSave>;
  /** Keyed by skill name (e.g. "Athletics"). */
  skills: Record<string, ComputedSkill>;
  passivePerception: number;
  /** Spell save DC / attack bonus / modifier, or null for non-casters. */
  spellcasting: ComputedSpellcasting | null;
  /** Max spell slots per level from the class progression, or null. */
  spellSlots: ComputedSpellSlots | null;
  /** XP progress within the current level's threshold band. */
  xp: ComputedXp;
}
