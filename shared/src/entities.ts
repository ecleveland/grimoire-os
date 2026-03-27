import type { CampaignStatus, NoteVisibility, Role } from './enums';
import type {
  AbilityScores,
  Combatant,
  Currency,
  DeathSaves,
  Feature,
  HitPoints,
  InventoryItem,
  SpellSlot,
} from './embedded';

export interface User {
  id: string;
  username: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  playerIds: string[];
  characterIds: string[];
  status: CampaignStatus;
  setting?: string;
  currentSession?: number;
  inviteCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
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
  id: string;
  campaignId: string;
  authorId: string;
  title: string;
  content: string;
  visibility: NoteVisibility;
  sessionNumber?: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Encounter {
  id: string;
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
