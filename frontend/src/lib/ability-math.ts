import type { AbilityScores } from '@/lib/types';
import { SKILLS } from '@/lib/dnd-constants';

// Pure ability-score math + ability/skill maps for contexts with NO server
// character yet — the guided builder and editor previews, where a live
// creation-time preview must match what the backend will derive. The character
// sheet itself no longer computes these: it reads the server-attached
// `character.computed` block, the authoritative source (VEG-412). No route or
// API dependency — formerly colocated under characters/[id]/_components/utils.ts,
// which now re-exports this module.

export const ABILITY_KEYS: (keyof AbilityScores)[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
];

export const ABILITY_LABELS: Record<keyof AbilityScores, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

export const ABILITY_KEY_TO_NAME: Record<keyof AbilityScores, string> = {
  strength: 'Strength',
  dexterity: 'Dexterity',
  constitution: 'Constitution',
  intelligence: 'Intelligence',
  wisdom: 'Wisdom',
  charisma: 'Charisma',
};

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

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function proficiencyBonus(level: number): number {
  return Math.ceil(level / 4) + 1;
}

export function passivePerception(wisScore: number, level: number, isProficient: boolean): number {
  return 10 + abilityModifier(wisScore) + (isProficient ? proficiencyBonus(level) : 0);
}

export function skillBonus(abilityScore: number, level: number, isProficient: boolean): number {
  return abilityModifier(abilityScore) + (isProficient ? proficiencyBonus(level) : 0);
}

// Derived from the canonical SKILLS list (single source of truth in
// @/lib/dnd-constants) so the sheet and the editor can't drift.
export const SKILL_ABILITY_MAP: Record<string, string> = Object.fromEntries(
  SKILLS.map(s => [s.name, s.ability])
);

export const ABILITY_SKILLS_MAP: Record<string, string[]> = Object.entries(
  SKILL_ABILITY_MAP
).reduce<Record<string, string[]>>((acc, [skill, ability]) => {
  (acc[ability] ??= []).push(skill);
  return acc;
}, {});
