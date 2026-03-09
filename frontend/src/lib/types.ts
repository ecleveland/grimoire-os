export interface User {
  _id: string;
  username: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  role: 'player' | 'dungeon_master' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  _id: string;
  name: string;
  description?: string;
  ownerId: string;
  playerIds: string[];
  characterIds: string[];
  status: 'active' | 'paused' | 'completed';
  setting?: string;
  currentSession?: number;
  inviteCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface HitPoints {
  max: number;
  current: number;
  temporary: number;
}

export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface SpellSlot {
  level: number;
  total: number;
  used: number;
}

export interface InventoryItem {
  name: string;
  quantity: number;
  description?: string;
  weight?: number;
  equipped: boolean;
}

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

export interface Feature {
  name: string;
  source?: string;
  description?: string;
}

export interface Character {
  _id: string;
  userId: string;
  campaignId?: string;
  name: string;
  race?: string;
  class?: string;
  level: number;
  subclass?: string;
  background?: string;
  alignment?: string;
  experiencePoints: number;
  abilityScores: AbilityScores;
  hitPoints: HitPoints;
  deathSaves: DeathSaves;
  armorClass: number;
  speed: number;
  initiative: number;
  proficiencies: string[];
  languages: string[];
  savingThrows: string[];
  skills: string[];
  spellcastingAbility?: string;
  spellSaveDC?: number;
  spellAttackBonus?: number;
  knownSpells: string[];
  preparedSpells: string[];
  spellSlots: SpellSlot[];
  inventory: InventoryItem[];
  currency: Currency;
  features: Feature[];
  personalityTraits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  backstory?: string;
  appearance?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Note {
  _id: string;
  campaignId: string;
  authorId: string;
  title: string;
  content: string;
  visibility: 'private' | 'party' | 'dm_only';
  sessionNumber?: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Combatant {
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  ac: number;
  isNpc: boolean;
  notes?: string;
}

export interface Encounter {
  _id: string;
  campaignId: string;
  createdBy: string;
  name: string;
  combatants: Combatant[];
  currentTurn: number;
  round: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SrdSpell {
  _id: string;
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
}

export interface SrdMonster {
  _id: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  armorClass: number;
  hitPoints: string;
  speed: string;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  challengeRating: string;
  actions: string[];
  description?: string;
}

export interface SrdItem {
  _id: string;
  name: string;
  category: string;
  cost?: string;
  weight?: string;
  description?: string;
  damage?: string;
  properties: string[];
}

export interface SrdClass {
  _id: string;
  name: string;
  hitDie: string;
  primaryAbilities: string[];
  savingThrows: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  skillChoices: string[];
  description?: string;
  features: string[];
}

export interface SrdRace {
  _id: string;
  name: string;
  speed: number;
  size: string;
  abilityBonuses: Record<string, number>;
  traits: string[];
  languages: string[];
  description?: string;
}
