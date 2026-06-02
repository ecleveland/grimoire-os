import { Expose } from 'class-transformer';
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
