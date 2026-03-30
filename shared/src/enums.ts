// ── Role ─────────────────────────────────────────────

export const Role = {
  PLAYER: 'player',
  DUNGEON_MASTER: 'dungeon_master',
  ADMIN: 'admin',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

// ── CampaignStatus ──────────────────────────────────

export const CampaignStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const;

export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

// ── NoteVisibility ──────────────────────────────────

export const NoteVisibility = {
  PRIVATE: 'private',
  PARTY: 'party',
  DM_ONLY: 'dm_only',
} as const;

export type NoteVisibility = (typeof NoteVisibility)[keyof typeof NoteVisibility];

// ── AuditAction ─────────────────────────────────────

export const AuditAction = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

// ── CombatantType ──────────────────────────────────

export const CombatantType = {
  PC: 'pc',
  NPC: 'npc',
} as const;

export type CombatantType = (typeof CombatantType)[keyof typeof CombatantType];
