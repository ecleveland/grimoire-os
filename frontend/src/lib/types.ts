// Runtime enum objects — values match @grimoire-os/shared, defined locally
// because Turbopack cannot resolve file:-linked packages for value imports.
export const Role = { PLAYER: 'player', DUNGEON_MASTER: 'dungeon_master', ADMIN: 'admin' } as const;
export type Role = (typeof Role)[keyof typeof Role];
export const CampaignStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];
export const NoteVisibility = { PRIVATE: 'private', PARTY: 'party', DM_ONLY: 'dm_only' } as const;
export type NoteVisibility = (typeof NoteVisibility)[keyof typeof NoteVisibility];
export const AuditAction = { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' } as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
export const CombatantType = { PC: 'pc', NPC: 'npc' } as const;
export type CombatantType = (typeof CombatantType)[keyof typeof CombatantType];

// Hit-die faces — mirrors DIE_TYPES in @grimoire-os/shared (the backend
// HitDiceDto validates `dieType` with `@IsIn(DIE_TYPES)`). Defined locally as a
// value because Turbopack can't resolve file:-linked packages for value imports.
export const DIE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;
export type DieType = (typeof DIE_TYPES)[number];

// Creature sizes, smallest to largest. Stored as a free-text string server-side
// (the DTO doesn't constrain it), but the editor offers the canonical set.
export const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const;
export type Size = (typeof SIZES)[number];

export type {
  // Embedded types
  AbilityScores,
  HitPoints,
  HitDice,
  DeathSaves,
  SpellEntry,
  SpellSlot,
  InventoryItem,
  AttunedItem,
  Currency,
  Feature,
  Weapon,
  Combatant,
  PartyCharacter,
  // Entity types
  User,
  Campaign,
  Character,
  Note,
  Encounter,
  // List projections
  CampaignListItem,
  CharacterListItem,
  NoteListItem,
  EncounterListItem,
  NpcListItem,
  // NPC
  Npc,
  NpcRelation,
  NpcLootOverrides,
  NpcLootItem,
  NpcRerollField,
  GenerateNpcRequest,
  GeneratedNpcPreview,
  // Pagination
  PaginatedResponse,
  // Response types
  AccessTokenResponse,
  InviteCodeResponse,
  // SRD sub-types
  ClassSpellcasting,
  ClassFeature,
  EquipmentChoice,
  EquipmentChoiceItem,
  StartingEquipment,
  MonsterAction,
  BackgroundFeature,
  // SRD entity types
  SrdSpell,
  SrdMonster,
  SrdItem,
  SrdItemBundleComponent,
  SrdClass,
  SrdRace,
  SrdSubclass,
  SrdSubrace,
  SrdBackground,
  SrdFeat,
  SrdSpecies,
  SrdCondition,
  SrdSkill,
  SrdLanguage,
} from '@grimoire-os/shared';
