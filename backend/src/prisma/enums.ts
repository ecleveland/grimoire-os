import {
  Role,
  CampaignStatus as PrismaCampaignStatus,
  NoteVisibility as PrismaNoteVisibility,
} from "@prisma/client";

// Re-export Prisma Role enum as UserRole with uppercase keys
// for backward compatibility with DTOs, guards, and decorators.
export const UserRole = {
  PLAYER: Role.player,
  DUNGEON_MASTER: Role.dungeon_master,
  ADMIN: Role.admin,
} as const;

export type UserRole = Role;

export const CampaignStatus = {
  ACTIVE: PrismaCampaignStatus.active,
  PAUSED: PrismaCampaignStatus.paused,
  COMPLETED: PrismaCampaignStatus.completed,
  ARCHIVED: PrismaCampaignStatus.archived,
} as const;
export type CampaignStatus = PrismaCampaignStatus;

export const NoteVisibility = {
  PRIVATE: PrismaNoteVisibility.private,
  PARTY: PrismaNoteVisibility.party,
  DM_ONLY: PrismaNoteVisibility.dm_only,
} as const;
export type NoteVisibility = PrismaNoteVisibility;
