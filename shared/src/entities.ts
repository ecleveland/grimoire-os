import type { CampaignStatus, NoteVisibility, Role } from './enums';
import type { ComputedStats } from './computed';
import type {
  AbilityScores,
  AttunedItem,
  CharacterFeat,
  CharacterResource,
  Combatant,
  CombatantConcentration,
  CombatantLootItem,
  Condition,
  Currency,
  DeathSaves,
  Feature,
  HitDice,
  HitPoints,
  InventoryItem,
  ShopLineItem,
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
  // Nullable to match the backend `CharacterDto` and the underlying `Json?` /
  // `Int?` Prisma columns: a legacy/minimal character deserializes these as
  // `null` (VEG-425). Consumers must guard (`?? default`) — the type now forces
  // it, so the compiler catches the null-deref the old lying type let through.
  abilityScores: AbilityScores | null;
  hitPoints: HitPoints | null;
  deathSaves: DeathSaves | null;
  armorClass: number | null;
  speed: number | null;
  initiative: number | null;
  proficiencies: string[];
  languages: string[];
  savingThrows: string[];
  skills: string[];
  spellcastingAbility?: string;
  spellSaveDC?: number;
  spellAttackBonus?: number;
  // Nullable JSONB columns: a character with no spells/slots/inventory/etc.
  // deserializes these as `null` (consumers guard with `?? []`). The `?` on
  // spells/attunedItems/feats/etc. is kept — the frontend never constructs a
  // Character (only reads deserialized JSON), so requiring them buys no safety.
  spells?: SpellEntry[] | null;
  spellSlots: SpellSlot[] | null;
  inventory: InventoryItem[] | null;
  attunedItems?: AttunedItem[] | null;
  currency: Currency | null;
  features: Feature[] | null;
  // Granted feats (VEG-430), e.g. a background's origin feat.
  feats?: CharacterFeat[] | null;
  personalityTraits?: string;
  ideals?: string;
  bonds?: string;
  flaws?: string;
  backstory?: string;
  appearance?: string;
  avatarUrl?: string;
  size?: string;
  heroicInspiration?: boolean;
  hitDice?: HitDice | null;
  armorTraining?: string[];
  weapons?: Weapon[] | null;
  // PC status tracking (VEG-408), sharing the combatant vocabulary from
  // embedded.ts. Honest-null per VEG-425: `conditions` is a Postgres String[]
  // and never deserializes null; the other two are nullable columns, so legacy
  // rows carry `null` and consumers must guard.
  /** Active SRD conditions; empty means none. */
  conditions: Condition[];
  /** Concentration; presence means concentrating (VEG-287 semantics). */
  concentration: CombatantConcentration | null;
  /** Exhaustion level 1–6; null (or 0) means none. */
  exhaustion: number | null;
  /**
   * Limited-use class/race resources (VEG-409), player-defined. Nullable JSONB
   * column: legacy/minimal characters carry `null` (consumers guard `?? []`).
   */
  resources?: CharacterResource[] | null;
  /** Optimistic-locking counter (VEG-137); incremented on each guarded write. */
  version: number;
  /**
   * Authoritative derived stats, attached by the backend to every character
   * response (VEG-346) and consumed by the sheet as the single source of truth
   * (VEG-412). Required, not optional: `toCharacterDto` always sets it, and an
   * honest type lets the sheet read it without fabricated fallbacks. Where a
   * stored column overlaps (initiative, spell-slot maxima), the computed value
   * wins for display; stored fields keep only the mutable play state (`used`).
   */
  computed: ComputedStats;
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

/**
 * Slim campaign-member projection (VEG-360) backing the owner-facing roster
 * member list and its DM "remove a player" control. `userId` is the
 * DELETE /campaigns/:id/players/:playerId target; `isOwner` lets the UI suppress
 * Remove on the owner's own row. Mirrored by the backend `CampaignMemberDto`.
 */
export interface CampaignMember {
  userId: string;
  displayName: string;
  isOwner: boolean;
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

/**
 * A campaign shop (VEG-353): DM-authored, campaign-scoped, owner-gated for
 * writes and member-readable so players can browse. `items` holds the stocked
 * line items; `isOpen` hides a shop from players without deleting it.
 */
export interface Shop {
  id: string;
  campaignId: string;
  createdById: string;
  name: string;
  theme: string;
  description?: string | null;
  icon?: string | null;
  accent?: string | null;
  items: ShopLineItem[];
  isOpen: boolean;
  /** Optimistic-locking counter (VEG-137 family); echoed as expectedShopVersion
   * on a purchase so a concurrent stock/price edit is detected (VEG-357/445). */
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Slim shop shape for list views — omits the heavy `items` array. */
export interface ShopListItem {
  id: string;
  campaignId: string;
  createdById: string;
  name: string;
  theme: string;
  description?: string | null;
  icon?: string | null;
  accent?: string | null;
  isOpen: boolean;
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
