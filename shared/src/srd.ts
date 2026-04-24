// ── SRD Sub-types ──────────────────────────────────────────────────────

/** Spellcasting configuration for a class (currently only stores ability; future M9 tickets add progression data) */
export interface ClassSpellcasting {
  ability: string;
  /** True only for Warlock — uses Pact Magic instead of standard spell slots */
  pactMagic?: boolean;
  /** Standard spell slot progression keyed by character level, then slot level → count */
  spellSlotProgression?: Record<number, Record<number, number>>;
  /** Warlock-only: pact slot progression keyed by character level */
  pactSlotProgression?: Record<number, { slots: number; slotLevel: number }>;
  /** Cantrips known at each character level (all casters) */
  cantripsKnown?: Record<number, number>;
  /** Spells known at each character level (Bard, Ranger, Sorcerer, Warlock) */
  spellsKnown?: Record<number, number>;
  /** Formula for prepared spell count (Cleric, Druid, Paladin, Wizard) */
  preparedFormula?: string;
}

/** A class or subclass feature unlocked at a specific level */
export interface ClassFeature {
  name: string;
  level: number;
  description?: string;
}

/** A starting equipment choice group for character creation */
export interface EquipmentChoiceItem {
  name: string;
  quantity: number;
}

export interface EquipmentChoice {
  choose: number;
  from: { items: EquipmentChoiceItem[] }[];
}

/** Starting equipment for a class, including guaranteed items and gold alternative */
export interface StartingEquipment {
  choices: EquipmentChoice[];
  guaranteed?: EquipmentChoiceItem[];
  startingGold?: string;
}

/** A named ability/action on a monster (special abilities, actions, reactions, legendary actions) */
export interface MonsterAction {
  name: string;
  description: string;
}

/** A background feature with name and description */
export interface BackgroundFeature {
  name: string;
  description: string;
}

// ── SRD Entity Interfaces ──────────────────────────────────────────────

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
  specialAbilities?: MonsterAction[];
  actions: MonsterAction[];
  reactions?: MonsterAction[];
  legendaryActions?: MonsterAction[];
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
  features: ClassFeature[];
  spellcasting?: ClassSpellcasting;
  equipmentChoices?: StartingEquipment;
  subclassLevel?: number;
  source: string;
}

export interface SrdRace {
  id: string;
  name: string;
  speed: number;
  size: string;
  abilityBonuses: Record<string, number>;
  traits: { name: string; description?: string }[];
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
  features?: ClassFeature[];
  spellList?: string[];
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
  feature?: BackgroundFeature | null;
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
  benefits?: string[];
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

export interface GameRule {
  id: string;
  category: string;
  key: string;
  value: Record<string, unknown>;
  source: string;
}
