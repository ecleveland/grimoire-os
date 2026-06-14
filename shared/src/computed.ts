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
  /** Resolved spellcasting ability (full name), or null for non-casters. */
  spellcastingAbility: string | null;
  /** Modifier of the spellcasting ability, or null for non-casters. */
  spellcastingModifier: number | null;
  /** 8 + proficiency bonus + spellcasting modifier, or null for non-casters. */
  spellSaveDC: number | null;
  /** Proficiency bonus + spellcasting modifier, or null for non-casters. */
  spellAttackBonus: number | null;
  /** Max spell slots per level from the class progression, or null. */
  spellSlots: ComputedSpellSlots | null;
}
