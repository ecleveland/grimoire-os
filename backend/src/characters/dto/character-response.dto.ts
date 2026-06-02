import { Expose } from 'class-transformer';
import type {
  AbilityScores,
  Currency,
  DeathSaves,
  Feature,
  HitDice,
  HitPoints,
  InventoryItem,
  SpellSlot,
  Weapon,
} from '@grimoire-os/shared';

/**
 * Full character detail payload (VEG-128). Whitelists every column the entity
 * legitimately exposes; a freshly-added Prisma column is dropped until it is
 * explicitly `@Expose()`d here. JSON blobs pass through untouched.
 */
export class CharacterDto {
  @Expose() id!: string;
  @Expose() userId!: string;
  @Expose() campaignId!: string | null;
  @Expose() name!: string;
  @Expose() race!: string | null;
  @Expose() class!: string | null;
  @Expose() level!: number;
  @Expose() subclass!: string | null;
  @Expose() background!: string | null;
  @Expose() alignment!: string | null;
  @Expose() experiencePoints!: number;
  @Expose() abilityScores!: AbilityScores | null;
  @Expose() hitPoints!: HitPoints | null;
  @Expose() deathSaves!: DeathSaves | null;
  @Expose() armorClass!: number | null;
  @Expose() speed!: number | null;
  @Expose() initiative!: number | null;
  @Expose() proficiencies!: string[];
  @Expose() languages!: string[];
  @Expose() savingThrows!: string[];
  @Expose() skills!: string[];
  @Expose() spellcastingAbility!: string | null;
  @Expose() spellSaveDC!: number | null;
  @Expose() spellAttackBonus!: number | null;
  @Expose() knownSpells!: string[];
  @Expose() preparedSpells!: string[];
  @Expose() spellSlots!: SpellSlot[] | null;
  @Expose() inventory!: InventoryItem[] | null;
  @Expose() currency!: Currency | null;
  @Expose() features!: Feature[] | null;
  @Expose() personalityTraits!: string | null;
  @Expose() ideals!: string | null;
  @Expose() bonds!: string | null;
  @Expose() flaws!: string | null;
  @Expose() backstory!: string | null;
  @Expose() appearance!: string | null;
  @Expose() avatarUrl!: string | null;
  @Expose() size!: string | null;
  @Expose() heroicInspiration!: boolean;
  @Expose() hitDice!: HitDice | null;
  @Expose() armorTraining!: string[];
  @Expose() weapons!: Weapon[] | null;
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}

/** Slim character shape for list views (VEG-125 projection, VEG-128 DTO). */
export class CharacterListItemDto {
  @Expose() id!: string;
  @Expose() userId!: string;
  @Expose() name!: string;
  @Expose() race!: string | null;
  @Expose() class!: string | null;
  @Expose() level!: number;
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}
