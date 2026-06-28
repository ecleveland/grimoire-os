import { Expose } from 'class-transformer';
import type { HitPoints } from '@grimoire-os/shared';
import { CampaignStatus } from '../../prisma/enums';

/**
 * Full campaign detail payload (VEG-128). Exposes the player/character id
 * projections the service builds and the owner-visible `inviteCode`, but never
 * the internal `inviteCodeExpiresAt` bookkeeping column.
 */
export class CampaignDto {
  @Expose() id!: string;
  @Expose() name!: string;
  @Expose() description!: string | null;
  @Expose() ownerId!: string;
  @Expose() status!: CampaignStatus;
  @Expose() setting!: string | null;
  @Expose() currentSession!: number;
  @Expose() inviteCode!: string | null;
  @Expose() playerIds!: string[];
  @Expose() characterIds!: string[];
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}

/**
 * Slim party-roster projection (VEG-283): just what the encounter tracker
 * needs to add a PC as a combatant (AC/HP snapshot, initiative modifier for
 * the auto-roll) plus display fields. Deliberately omits the rest of the
 * sheet — members must not see each other's backstory, inventory, or currency
 * through the roster. Wire shape mirrors the shared `PartyCharacter` type.
 */
export class PartyCharacterDto {
  @Expose() id!: string;
  @Expose() userId!: string;
  @Expose() name!: string;
  @Expose() race!: string | null;
  @Expose() class!: string | null;
  @Expose() level!: number;
  @Expose() armorClass!: number | null;
  @Expose() initiative!: number | null;
  @Expose() hitPoints!: HitPoints | null;
}

/**
 * Campaign member projection backing the roster's owner-facing member list and
 * its DM "remove a player" control (VEG-360). Just the identity fields the UI
 * needs — userId (the `DELETE /players/:playerId` target), a display name, and
 * the owner flag so the UI never offers a Remove on the owner's own row. Owner
 * only; non-members never see the campaign's member identities.
 */
export class CampaignMemberDto {
  @Expose() userId!: string;
  @Expose() displayName!: string;
  @Expose() isOwner!: boolean;
}

/** Slim campaign shape for list views (VEG-125 projection, VEG-128 DTO). */
export class CampaignListItemDto {
  @Expose() id!: string;
  @Expose() name!: string;
  @Expose() description!: string | null;
  @Expose() ownerId!: string;
  @Expose() status!: CampaignStatus;
  @Expose() playerIds!: string[];
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}
