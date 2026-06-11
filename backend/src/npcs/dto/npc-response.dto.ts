import { Expose } from 'class-transformer';
import type { NpcLootItem, NpcLootOverrides, NpcRelation } from '@grimoire-os/shared';

/**
 * NPC relation row (VEG-128). The optional `fromNpc`/`toNpc` joins are the slim
 * `{ id, name, race }` previews the service already selects, so they pass
 * through untouched.
 */
export class NpcRelationDto {
  @Expose() id!: string;
  @Expose() fromNpcId!: string;
  @Expose() toNpcId!: string;
  @Expose() relation!: string;
  @Expose() notes!: string | null;
  @Expose() fromNpc?: { id: string; name: string; race: string } | null;
  @Expose() toNpc?: { id: string; name: string; race: string } | null;
}

/** Full NPC detail payload (VEG-128), including relation links and JSON blobs. */
export class NpcDto {
  @Expose() id!: string;
  @Expose() campaignId!: string;
  @Expose() createdById!: string;
  @Expose() name!: string;
  @Expose() race!: string;
  @Expose() background!: string | null;
  @Expose() profession!: string | null;
  @Expose() alignment!: string | null;
  @Expose() size!: string | null;
  @Expose() age!: number | null;
  @Expose() gender!: string | null;
  @Expose() appearance!: string | null;
  @Expose() personalityTraits!: string[];
  @Expose() ideals!: string[];
  @Expose() bonds!: string[];
  @Expose() flaws!: string[];
  @Expose() statBlock!: Record<string, unknown> | null;
  @Expose() goldPieces!: number;
  @Expose() silverPieces!: number;
  @Expose() copperPieces!: number;
  @Expose() loot!: NpcLootItem[] | Record<string, unknown> | null;
  @Expose() lootOverrides!: NpcLootOverrides | null;
  @Expose() generationParams!: Record<string, unknown> | null;
  @Expose() lockedFields!: string[];
  @Expose() isManual!: boolean;
  @Expose() outgoingLinks?: NpcRelation[];
  @Expose() incomingLinks?: NpcRelation[];
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}

/** Slim NPC shape for list views (VEG-125 projection, VEG-128 DTO). */
export class NpcListItemDto {
  @Expose() id!: string;
  @Expose() campaignId!: string;
  @Expose() createdById!: string;
  @Expose() name!: string;
  @Expose() race!: string;
  @Expose() profession!: string | null;
  @Expose() alignment!: string | null;
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}
