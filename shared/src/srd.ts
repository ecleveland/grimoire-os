export interface SrdSpell {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  classes: string[];
  ritual: boolean;
  concentration: boolean;
  material?: string;
  higherLevels?: string;
  source: string;
}

export interface SrdMonster {
  id: string;
  name: string;
  size: string;
  type: string;
  subtype?: string;
  alignment: string;
  armorClass: number;
  armorType?: string;
  hitPoints: string;
  hitDice?: string;
  speed: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  savingThrows?: Record<string, number>;
  skills?: Record<string, number>;
  damageResistances: string[];
  damageImmunities: string[];
  damageVulnerabilities: string[];
  conditionImmunities: string[];
  senses?: string;
  languages?: string;
  challengeRating: string;
  experiencePoints?: number;
  specialAbilities?: unknown[];
  actions: string[];
  reactions?: unknown[];
  legendaryActions?: unknown[];
  description?: string;
  source: string;
}

export interface SrdItem {
  id: string;
  name: string;
  category: string;
  cost?: string;
  weight?: string;
  description?: string;
  damage?: string;
  damageType?: string;
  armorClass?: number;
  stealthDisadvantage?: boolean;
  strengthRequirement?: number;
  properties: string[];
  rarity?: string;
  requiresAttunement?: boolean;
  isMagic?: boolean;
  source: string;
}

export interface SrdClass {
  id: string;
  name: string;
  hitDie: string;
  primaryAbilities: string[];
  savingThrows: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  skillChoices: string[];
  toolProficiencies: string[];
  numSkillChoices: number;
  description?: string;
  features: string[];
  spellcasting?: unknown;
  equipmentChoices?: unknown[];
  subclassLevel?: number;
  source: string;
}

export interface SrdRace {
  id: string;
  name: string;
  speed: number;
  size: string;
  abilityBonuses: Record<string, number>;
  traits: string[];
  languages: string[];
  description?: string;
  age?: string;
  alignment?: string;
  sizeDescription?: string;
  source: string;
}

export interface SrdSubclass {
  id: string;
  name: string;
  classId: string;
  description?: string;
  features?: unknown[];
  spellList?: unknown[];
  source: string;
}

export interface SrdSubrace {
  id: string;
  name: string;
  raceId: string;
  description?: string;
  abilityBonuses?: Record<string, number>;
  traits?: string[];
  source: string;
}

export interface SrdBackgroundAbilityScores {
  choose: number;
  options: string[];
}

export interface SrdBackground {
  id: string;
  name: string;
  description?: string;
  skillProficiencies: string[];
  toolProficiencies: string[];
  languages: number;
  equipment?: string;
  feature?: unknown;
  feat?: string;
  abilityScores?: SrdBackgroundAbilityScores;
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
  source: string;
}

export interface SrdFeat {
  id: string;
  name: string;
  description?: string;
  prerequisite?: string;
  benefits?: unknown;
  category?: string;
  repeatable?: boolean;
  source: string;
}

export interface SrdSpeciesTrait {
  name: string;
  description: string;
}

export interface SrdSpecies {
  id: string;
  name: string;
  speed: number;
  size: string;
  description?: string;
  traits?: SrdSpeciesTrait[];
  source: string;
}

export interface SrdCondition {
  id: string;
  name: string;
  description?: string;
  bullets: string[];
  source: string;
}

export interface SrdSkill {
  id: string;
  name: string;
  ability: string;
  description?: string;
  source: string;
}

export interface SrdLanguage {
  id: string;
  name: string;
  type: string;
  typicalSpeakers?: string;
  script?: string;
  source: string;
}
