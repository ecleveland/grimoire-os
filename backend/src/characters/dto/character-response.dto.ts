import { Expose } from 'class-transformer';
import type {
  AbilityScores,
  AttunedItem,
  CharacterClass,
  CharacterFeat,
  CharacterResource,
  CombatantConcentration,
  ComputedStats,
  Condition,
  Currency,
  DeathSaves,
  Feature,
  HitDice,
  HitPoints,
  InventoryItem,
  SpellEntry,
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
  /** Classes held, first taken first. The written and read shape. */
  @Expose() classes!: CharacterClass[];
  /** @deprecated Read-only projection of classes[0].name. Read `classes`. */
  @Expose() class!: string | null;
  /** @deprecated Read-only projection of classes[0].classId. Read `classes`. */
  @Expose() classId!: string | null;
  @Expose() level!: number;
  /** @deprecated Read-only projection of classes[0].subclass. Read `classes`. */
  @Expose() subclass!: string | null;
  /** @deprecated Read-only projection of classes[0].subclassId. Read `classes`. */
  @Expose() subclassId!: string | null;
  @Expose() background!: string | null;
  @Expose() backgroundId!: string | null;
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
  @Expose() spells!: SpellEntry[] | null;
  @Expose() spellSlots!: SpellSlot[] | null;
  @Expose() inventory!: InventoryItem[] | null;
  @Expose() attunedItems!: AttunedItem[] | null;
  @Expose() currency!: Currency | null;
  @Expose() features!: Feature[] | null;
  @Expose() feats!: CharacterFeat[] | null;
  @Expose() personalityTraits!: string | null;
  @Expose() ideals!: string | null;
  @Expose() bonds!: string | null;
  @Expose() flaws!: string | null;
  @Expose() backstory!: string | null;
  @Expose() appearance!: string | null;
  @Expose() avatarUrl!: string | null;
  @Expose() size!: string | null;
  @Expose() heroicInspiration!: boolean;
  /** One pool per die type; null when none is recorded. */
  @Expose() hitDice!: HitDice[] | null;
  @Expose() armorTraining!: string[];
  @Expose() weapons!: Weapon[] | null;
  // PC status tracking (VEG-408).
  @Expose() conditions!: Condition[];
  @Expose() concentration!: CombatantConcentration | null;
  @Expose() exhaustion!: number | null;
  // Limited-use class/race resources (VEG-409); null on legacy/minimal rows.
  @Expose() resources!: CharacterResource[] | null;
  @Expose() version!: number;
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
  /**
   * Server-derived stats (VEG-346): modifiers, proficiency bonus, save/skill
   * bonuses, passive perception, initiative, spell DC/attack, spell-slot
   * maxima. The single source of truth the sheet reads — recomputed per request
   * from the stored inputs, so it can't drift. Like the JSON blobs above, this
   * passes through `toDto` untouched (no `@Type`). Always populated on detail
   * reads/writes; never returned on the slim list projection.
   */
  @Expose() computed!: ComputedStats;
}

/**
 * The detail read's payload, returned only by `GET /characters/:id`. `isOwner`
 * is false when a campaign DM reads a player's sheet. `ownerName` is the
 * owner's display name for the read-only banner.
 */
export class CharacterDetailDto extends CharacterDto {
  @Expose() isOwner!: boolean;
  @Expose() ownerName!: string;
}

/**
 * Slim character shape for list views (VEG-125 projection, VEG-128 DTO). `class`
 * is the first class's name.
 */
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
