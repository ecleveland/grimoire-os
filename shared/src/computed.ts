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
  thresholds: Readonly<Record<string, number>>,
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
  /** AC from equipped gear, with the stored column as manual override (VEG-410). */
  armorClass: ComputedArmorClass;
  /** Attack rows derived from equipped weapons (VEG-410); manual `Character.weapons` entries are separate. */
  weapons: Weapon[];
}
