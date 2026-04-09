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

export type {
  // Embedded types
  AbilityScores,
  HitPoints,
  DeathSaves,
  SpellSlot,
  InventoryItem,
  Currency,
  Feature,
  Combatant,
  // Entity types
  User,
  Campaign,
  Character,
  Note,
  Encounter,
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
