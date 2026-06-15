// Canonical 5e option sets shared by the character editor and the character
// sheet. Single source of truth — the sheet's `[id]/_components/utils.ts`
// derives its skill→ability map from `SKILLS` here rather than re-listing them.
// Stored as full names everywhere (e.g. 'Strength', 'Athletics'), matching how
// Character.savingThrows/skills are persisted.

export const ABILITY_NAMES = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
] as const;
export type AbilityName = (typeof ABILITY_NAMES)[number];

export interface SkillDef {
  name: string;
  ability: AbilityName;
}

export const SKILLS: readonly SkillDef[] = [
  { name: 'Athletics', ability: 'Strength' },
  { name: 'Acrobatics', ability: 'Dexterity' },
  { name: 'Sleight of Hand', ability: 'Dexterity' },
  { name: 'Stealth', ability: 'Dexterity' },
  { name: 'Arcana', ability: 'Intelligence' },
  { name: 'History', ability: 'Intelligence' },
  { name: 'Investigation', ability: 'Intelligence' },
  { name: 'Nature', ability: 'Intelligence' },
  { name: 'Religion', ability: 'Intelligence' },
  { name: 'Animal Handling', ability: 'Wisdom' },
  { name: 'Insight', ability: 'Wisdom' },
  { name: 'Medicine', ability: 'Wisdom' },
  { name: 'Perception', ability: 'Wisdom' },
  { name: 'Survival', ability: 'Wisdom' },
  { name: 'Deception', ability: 'Charisma' },
  { name: 'Intimidation', ability: 'Charisma' },
  { name: 'Performance', ability: 'Charisma' },
  { name: 'Persuasion', ability: 'Charisma' },
] as const;

export const SKILL_NAMES: readonly string[] = SKILLS.map(s => s.name);

// Armor-training categories — matches the sheet's EquipmentTraining dots.
export const ARMOR_TYPES = ['Light', 'Medium', 'Heavy', 'Shields'] as const;
export type ArmorType = (typeof ARMOR_TYPES)[number];
