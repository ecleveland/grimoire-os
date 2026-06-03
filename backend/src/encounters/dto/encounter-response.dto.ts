import { Expose } from 'class-transformer';
import type { Combatant } from '@grimoire-os/shared';

/** Full encounter detail payload (VEG-128). */
export class EncounterDto {
  @Expose() id!: string;
  @Expose() campaignId!: string;
  @Expose() createdById!: string;
  @Expose() name!: string;
  @Expose() combatants!: Combatant[] | null;
  @Expose() currentTurn!: number;
  @Expose() round!: number;
  @Expose() isActive!: boolean;
  @Expose() version!: number;
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}

/**
 * Slim encounter shape for list views (VEG-125 projection, VEG-128 DTO). Drops
 * `currentTurn` and `createdById`, which the list does not render.
 */
export class EncounterListItemDto {
  @Expose() id!: string;
  @Expose() campaignId!: string;
  @Expose() name!: string;
  @Expose() combatants!: Combatant[] | null;
  @Expose() round!: number;
  @Expose() isActive!: boolean;
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}
