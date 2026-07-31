import type { AbilityScores } from '@/lib/types';
import {
  ABILITY_KEYS,
  ABILITY_NAME_BY_KEY,
  PROFICIENCY_BONUS_TABLE,
  SKILL_ABILITY_MAP,
  abilityModifier as sharedAbilityModifier,
  formatSigned,
  proficiencyBonusFrom,
} from '@grimoire-os/shared';

// Pure ability-score math + ability/skill maps for contexts with NO server
// character yet — the guided builder and editor previews, where a live
// creation-time preview must match what the backend will derive. The character
// sheet itself no longer computes these: it reads the server-attached
// `character.computed` block, the authoritative source (VEG-412). No route or
// API dependency — formerly colocated under characters/[id]/_components/utils.ts,
// which now re-exports this module.
//
// The formulas and the ability/skill tables come from @grimoire-os/shared, the
// single implementation the backend compute layer also uses (VEG-453). What
// stays here is presentation: the terse column labels and the inverted
// ability→skills map the sheet's ability columns render from.

export { ABILITY_KEYS, SKILL_ABILITY_MAP };

export const ABILITY_LABELS: Record<keyof AbilityScores, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

/** Alias of the shared key→full-name map, under this module's long-standing
 * name. Deliberately un-annotated: that keeps the shared `AbilityName` union
 * (and its readonly-ness) instead of widening the values back to `string`. */
export const ABILITY_KEY_TO_NAME = ABILITY_NAME_BY_KEY;

/**
 * Resolve a class's `primaryAbilities` (full ability *names*, e.g. ['Dexterity',
 * 'Wisdom']) to the matching ability *keys*, returned in canonical `ABILITY_KEYS`
 * order regardless of input order. Names with no ability match are dropped, so an
 * absent/empty/homebrew-without-data class yields `[]` — the callers treat that
 * as "no recommendation to show". Purely informational; it never constrains how
 * scores are spent or stored (VEG-447).
 */
export function recommendedAbilityKeys(primaryAbilities?: string[]): (keyof AbilityScores)[] {
  if (!primaryAbilities?.length) return [];
  return ABILITY_KEYS.filter(k => primaryAbilities.includes(ABILITY_KEY_TO_NAME[k]));
}

/** Delegates to the shared canonical formula (VEG-410) — one implementation
 * feeds the backend compute layer, the roster AC, and these previews. */
export function abilityModifier(score: number): number {
  return sharedAbilityModifier(score);
}

/** Delegates to the shared signed formatter so derived weapon rows, ability
 * modifiers, and stat blocks can never drift in "+N/-N" rendering (VEG-410). */
export function formatModifier(mod: number): string {
  return formatSigned(mod);
}

/** Delegates to the shared table lookup the backend computes from, so a preview
 * bonus matches the one the API will derive — including the 1–20 clamp on an
 * out-of-range level, which the old local `ceil(level/4)+1` lacked (VEG-453). */
export function proficiencyBonus(level: number): number {
  return proficiencyBonusFrom(PROFICIENCY_BONUS_TABLE, level);
}

export function skillBonus(abilityScore: number, level: number, isProficient: boolean): number {
  return abilityModifier(abilityScore) + (isProficient ? proficiencyBonus(level) : 0);
}

export const ABILITY_SKILLS_MAP: Record<string, string[]> = Object.entries(
  SKILL_ABILITY_MAP
).reduce<Record<string, string[]>>((acc, [skill, ability]) => {
  (acc[ability] ??= []).push(skill);
  return acc;
}, {});
