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

export const SKILL_ABILITY_MAP: Record<string, string> = {
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

export const ABILITY_SKILLS_MAP: Record<string, string[]> = Object.entries(
  SKILL_ABILITY_MAP
).reduce<Record<string, string[]>>((acc, [skill, ability]) => {
  (acc[ability] ??= []).push(skill);
  return acc;
}, {});
