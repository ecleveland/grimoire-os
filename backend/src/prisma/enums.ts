import {
  Role as PrismaRole,
  CampaignStatus as PrismaCampaignStatus,
  NoteVisibility as PrismaNoteVisibility,
} from '@prisma/client';

// Re-export shared types for use across the backend.
// The const objects provide uppercase key access (e.g., UserRole.ADMIN)
// while the types match Prisma's enum values.
export { Role, CampaignStatus, NoteVisibility, AuditAction } from '@grimoire-os/shared';

// Keep backward-compatible aliases used by guards and decorators.
export const UserRole = {
  PLAYER: PrismaRole.player,
  DUNGEON_MASTER: PrismaRole.dungeon_master,
  ADMIN: PrismaRole.admin,
} as const;

export type UserRole = PrismaRole;
