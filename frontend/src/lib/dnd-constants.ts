// Canonical 5e option sets shared by the character editor and the character
// sheet. Stored as full names everywhere (e.g. 'Strength', 'Athletics'),
// matching how Character.savingThrows/skills are persisted.
//
// The ability names and the skill→ability pairs come from @grimoire-os/shared,
// which the backend compute layer also derives against — so the builder preview
// and the sheet can't drift from the seeded `game_rules` mappings the API
// computes with (VEG-453). Backend drift guards pin the shared master copy to
// the seeded rule.

import { ABILITY_NAMES, SKILL_ABILITY_MAP } from '@grimoire-os/shared';
import type { AbilityName } from '@grimoire-os/shared';

export { ABILITY_NAMES };
export type { AbilityName };

export interface SkillDef {
  name: string;
  ability: AbilityName;
}

/** The shared skill→ability map projected to rows, preserving its order. */
export const SKILLS: readonly SkillDef[] = Object.entries(SKILL_ABILITY_MAP).map(
  ([name, ability]) => ({ name, ability })
);

export const SKILL_NAMES: readonly string[] = SKILLS.map(s => s.name);

// Armor-training categories — matches the sheet's EquipmentTraining dots.
export const ARMOR_TYPES = ['Light', 'Medium', 'Heavy', 'Shields'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];
