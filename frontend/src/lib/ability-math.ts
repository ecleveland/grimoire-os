import type { AbilityScores } from '@/lib/types';
import { SKILLS } from '@/lib/dnd-constants';

// Pure ability-score math + ability/skill maps. The single source of truth for
// the values the character sheet, the editor, and the guided builder all render
// (so a live creation-time preview matches the saved sheet). No route or API
// dependency — formerly colocated under characters/[id]/_components/utils.ts,
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
