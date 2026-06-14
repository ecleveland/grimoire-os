import type { CampaignStatus, NoteVisibility, Role } from './enums';
import type {
  AbilityScores,
  AttunedItem,
  Combatant,
  CombatantLootItem,
  Currency,
  DeathSaves,
  Feature,
  HitDice,
  HitPoints,
  InventoryItem,
  SpellEntry,
  SpellSlot,
  Weapon,
} from './embedded';

export interface User {
  id: string;
  username: string;
  displayName?: string;
  email?: string | null;
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
  // Optional: the backing JSONB columns are nullable, so a character with no
  // spells/attunement deserializes these as absent (consumers guard with `?? []`).
  spells?: SpellEntry[];
  spellSlots: SpellSlot[];
  inventory: InventoryItem[];
  attunedItems?: AttunedItem[];
  currency: Currency;
  features: Feature[];
  personalityTraits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  backstory?: string;
  appearance?: string;
  avatarUrl?: string;
  size?: string;
  heroicInspiration?: boolean;
  hitDice?: HitDice;
  armorTraining?: string[];
  weapons?: Weapon[];
  /** Optimistic-locking counter (VEG-137); incremented on each guarded write. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

// ── List projections ─────────────────────────────────
// Slim shapes returned by list endpoints (GET collections). Detail endpoints
// return the full entity above. See VEG-125.

export interface CampaignListItem {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  status: CampaignStatus;
  playerIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CharacterListItem {
  id: string;
  userId: string;
  name: string;
  race?: string;
  class?: string;
  level: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Slim party-roster projection returned by GET /campaigns/:id/characters
 * (VEG-283): the combatant-relevant snapshot (AC/HP, initiative modifier)
 * plus display fields. Deliberately omits the rest of the sheet — members
 * must not see each other's backstory, inventory, or currency through the
 * roster; full sheets stay owner-only.
 */
export interface PartyCharacter {
  id: string;
  userId: string;
  name: string;
  race: string | null;
  class: string | null;
  level: number;
  armorClass: number | null;
  initiative: number | null;
  hitPoints: HitPoints | null;
}

export interface Note {
  id: string;
  campaignId: string;
  authorId: string;
  title: string;
  content: string;
  visibility: NoteVisibility;
  sessionNumber?: number | null;
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
  /** Optimistic-locking counter (VEG-137); incremented on each guarded write. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteListItem {
  id: string;
  campaignId: string;
  title: string;
  visibility: NoteVisibility;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EncounterListItem {
  id: string;
  campaignId: string;
  name: string;
  combatants: Combatant[];
  round: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── NPC ──────────────────────────────────────────────

export type NpcLootOverrides = {
  trinketChance?: number;
  magicItemChance?: number;
  itemCountDie?: string;
  coinageMultiplier?: number;
};

// Historical name for the loot-engine item shape, kept because it is the
// persisted Npc.loot contract. The shape (and its widened `source` union)
// lives in embedded.ts so Combatant.loot can share it (VEG-300).
export type NpcLootItem = CombatantLootItem;

export interface NpcRelation {
  id: string;
  fromNpcId: string;
  toNpcId: string;
  relation: string;
  notes?: string | null;
  // Optional joins included by GET /npcs/:id so the UI can render names
  // without a follow-up fetch per row.
  fromNpc?: { id: string; name: string; race: string } | null;
  toNpc?: { id: string; name: string; race: string } | null;
}

export interface Npc {
  id: string;
  campaignId: string;
  createdById: string;
  name: string;
  race: string;
  background?: string | null;
  profession?: string | null;
  alignment?: string | null;
  size?: string | null;
  age?: number | null;
  gender?: string | null;
  appearance?: string | null;
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
  statBlock?: Record<string, unknown> | null;
  goldPieces: number;
  silverPieces: number;
  copperPieces: number;
  loot?: NpcLootItem[] | Record<string, unknown> | null;
  lootOverrides?: NpcLootOverrides | null;
  generationParams?: Record<string, unknown> | null;
  lockedFields: string[];
  isManual: boolean;
  outgoingLinks?: NpcRelation[];
  incomingLinks?: NpcRelation[];
  createdAt: string;
  updatedAt: string;
}

export interface NpcListItem {
  id: string;
  campaignId: string;
  createdById: string;
  name: string;
  race: string;
  profession?: string | null;
  alignment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NpcRerollField =
  | 'race'
  | 'background'
  | 'profession'
  | 'alignment'
  | 'name'
  | 'appearance'
  | 'personality'
  | 'loot'
  | 'statBlock'
  | 'all';

export interface GenerateNpcRequest {
  campaignId: string;
  seed?: string;
  race?: string;
  setting?: string;
  background?: string;
  profession?: string;
  alignment?: string;
  name?: string;
  gender?: 'male' | 'female';
  hostility?: 'friendly' | 'neutral' | 'hostile';
  combatRelevant?: boolean;
  lootOverrides?: NpcLootOverrides;
}

export interface GeneratedNpcPreview {
  campaignId: string;
  name: string;
  race: string;
  background: string | null;
  profession: string | null;
  alignment: string;
  size: string | null;
  age: number | null;
  gender: string | null;
  appearance: string | null;
  personalityTraits: string[];
  ideals: string[];
  bonds: string[];
  flaws: string[];
  statBlock: Record<string, unknown> | null;
  goldPieces: number;
  silverPieces: number;
  copperPieces: number;
  loot: NpcLootItem[];
  lootOverrides: NpcLootOverrides | null;
  generationParams: Record<string, unknown>;
}
