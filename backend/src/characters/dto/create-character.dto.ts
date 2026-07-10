import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  ValidateNested,
  IsIn,
  IsUUID,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AttunedItem,
  CharacterFeat,
  CONDITIONS,
  DIE_TYPES,
  Feature,
  MAX_EXPERIENCE_POINTS,
  RECHARGE_KINDS,
  SpellEntry,
} from '@grimoire-os/shared';
import { IsStrictBoolean } from '../../common/validators/is-strict-boolean.decorator';
import { IsLteSibling } from '../../common/validators/is-lte-sibling.decorator';
import { IsNonBlankString } from '../../common/validators/non-blank-string.decorator';
import { ConcentrationDto } from '../../common/dto/concentration.dto';

class AbilityScoresDto {
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  strength?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  dexterity?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  constitution?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  intelligence?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  wisdom?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  charisma?: number;
}

class HitPointsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  max?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  current?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  temporary?: number;
}

class DeathSavesDto {
  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  successes?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  failures?: number;
}

class SpellSlotDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  level!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  total?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  used?: number;
}

class InventoryItemDto {
  @ApiProperty({ example: 'Longsword' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  equipped?: boolean;

  @ApiPropertyOptional({ description: 'Optional link to the Item catalog row' })
  @IsOptional()
  @IsUUID()
  itemId?: string;
}

class CurrencyDto {
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  cp?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  sp?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  ep?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  gp?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  pp?: number;
}

class HitDiceDto {
  @ApiProperty({ example: 'd10', enum: DIE_TYPES })
  @IsIn(DIE_TYPES)
  dieType!: string;

  @ApiProperty({ example: 8 })
  @IsNumber()
  total!: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  spent!: number;
}

class ResourceDto {
  @ApiProperty({ example: 'Ki Points' })
  // Non-blank, not just non-empty: a whitespace-only name would render an
  // unidentifiable row whose Edit/Remove aria-labels collapse to bare verbs.
  @IsNonBlankString()
  name!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 99 })
  @IsInt()
  @Min(1)
  @Max(99)
  max!: number;

  @ApiProperty({ example: 2, minimum: 0, maximum: 99 })
  @IsInt()
  @Min(0)
  @Max(99)
  @IsLteSibling('max')
  used!: number;

  @ApiProperty({ example: 'short', enum: RECHARGE_KINDS })
  @IsIn(RECHARGE_KINDS)
  recharge!: string;
}

class WeaponDto {
  @ApiProperty({ example: 'Longsword' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '+5' })
  @IsString()
  attackBonus!: string;

  @ApiProperty({ example: '1d8+3' })
  @IsString()
  damage!: string;

  @ApiProperty({ example: 'slashing' })
  @IsString()
  damageType!: string;

  @ApiPropertyOptional({ example: 'Versatile (1d10)' })
  @IsOptional()
  @IsString()
  notes?: string;
}

class FeatureDto implements Feature {
  @ApiProperty({ example: 'Darkvision' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

class CharacterFeatDto implements CharacterFeat {
  @ApiPropertyOptional({ description: 'SRD/homebrew Feat id when granted from the catalog' })
  @IsOptional()
  @IsString()
  featId?: string | null;

  @ApiProperty({ example: 'Magic Initiate' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Cleric', description: 'Chosen option for a parameterized feat' })
  @IsOptional()
  @IsString()
  option?: string | null;

  @ApiPropertyOptional({ description: 'Where the grant came from, e.g. the background name' })
  @IsOptional()
  @IsString()
  source?: string;
}

class SpellEntryDto implements SpellEntry {
  @ApiProperty({ example: 3, description: '0 = cantrip' })
  @IsInt()
  @Min(0)
  @Max(9)
  level!: number;

  @ApiProperty({ example: 'Fireball' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsStrictBoolean()
  prepared?: boolean;

  @ApiPropertyOptional({ example: '1 action' })
  @IsOptional()
  @IsString()
  castingTime?: string;

  @ApiPropertyOptional({ example: '150 feet' })
  @IsOptional()
  @IsString()
  range?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  concentration?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  ritual?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsStrictBoolean()
  material?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Optional link to the Spell catalog row' })
  @IsOptional()
  @IsUUID()
  spellId?: string;
}

class AttunedItemDto implements AttunedItem {
  @ApiProperty({ example: 'Cloak of Protection' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ description: 'Optional link to the Item catalog row' })
  @IsOptional()
  @IsUUID()
  itemId?: string;
}

export class CreateCharacterDto {
  @ApiProperty({ example: 'Thorin Ironforge' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Dwarf' })
  @IsOptional()
  @IsString()
  race?: string;

  @ApiPropertyOptional({ example: 'Fighter' })
  @IsOptional()
  @IsString()
  class?: string;

  // Same boundary rationale as experiencePoints: level became client-writable
  // with the level-up assistant (VEG-411), and Prisma 500s on a non-integer or
  // out-of-range Int. 5e caps characters at level 20 (MAX_LEVEL mirrors this
  // in the sheet UI).
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  level?: number;

  @ApiPropertyOptional({ example: 'Champion' })
  @IsOptional()
  @IsString()
  subclass?: string;

  @ApiPropertyOptional({ example: 'Soldier' })
  @IsOptional()
  @IsString()
  background?: string;

  @ApiPropertyOptional({ example: 'Lawful Good' })
  @IsOptional()
  @IsString()
  alignment?: string;

  // Bounded to the Postgres int4 range: the sheet's Award XP control (VEG-411)
  // writes this repeatedly, and an unchecked finite value past the column range
  // overflows in Prisma and 500s instead of 400ing here.
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_EXPERIENCE_POINTS)
  experiencePoints?: number;

  @ApiPropertyOptional({ type: AbilityScoresDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AbilityScoresDto)
  abilityScores?: AbilityScoresDto;

  @ApiPropertyOptional({ type: HitPointsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HitPointsDto)
  hitPoints?: HitPointsDto;

  @ApiPropertyOptional({ type: DeathSavesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeathSavesDto)
  deathSaves?: DeathSavesDto;

  @ApiPropertyOptional({ example: 16 })
  @IsOptional()
  @IsNumber()
  armorClass?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  speed?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  initiative?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  proficiencies?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  savingThrows?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional({ example: 'Intelligence' })
  @IsOptional()
  @IsString()
  spellcastingAbility?: string;

  @ApiPropertyOptional({ example: 13 })
  @IsOptional()
  @IsNumber()
  spellSaveDC?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  spellAttackBonus?: number;

  @ApiPropertyOptional({ type: [SpellEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpellEntryDto)
  spells?: SpellEntryDto[];

  @ApiPropertyOptional({ type: [SpellSlotDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpellSlotDto)
  spellSlots?: SpellSlotDto[];

  @ApiPropertyOptional({ type: [InventoryItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  inventory?: InventoryItemDto[];

  @ApiPropertyOptional({ type: [AttunedItemDto], description: 'Up to 3 attuned magic items' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => AttunedItemDto)
  attunedItems?: AttunedItemDto[];

  @ApiPropertyOptional({ type: CurrencyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CurrencyDto)
  currency?: CurrencyDto;

  @ApiPropertyOptional({ type: [FeatureDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureDto)
  features?: FeatureDto[];

  @ApiPropertyOptional({ type: [CharacterFeatDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CharacterFeatDto)
  feats?: CharacterFeatDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personalityTraits?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ideals?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bonds?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  flaws?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backstory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appearance?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: 'Medium' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsStrictBoolean()
  heroicInspiration?: boolean;

  @ApiPropertyOptional({ type: HitDiceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HitDiceDto)
  hitDice?: HitDiceDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  armorTraining?: string[];

  @ApiPropertyOptional({ type: [WeaponDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeaponDto)
  weapons?: WeaponDto[];

  // PC status tracking (VEG-408). Whitelisted here so the sheet's PATCHes pass
  // forbidNonWhitelisted (the VEG-349 deathSaves lesson).
  @ApiPropertyOptional({ enum: CONDITIONS, isArray: true, example: ['Poisoned'] })
  @IsOptional()
  // null → [] so a null clear behaves like the concentration/exhaustion
  // clears; without it @IsOptional lets null through to Prisma, which rejects
  // it for the required String[] column (a 500 instead of a clean clear).
  @Transform(({ value }) => (value === null ? [] : (value as unknown)))
  @IsArray()
  @ArrayUnique()
  @IsIn(CONDITIONS, { each: true })
  conditions?: string[];

  @ApiPropertyOptional({ type: ConcentrationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ConcentrationDto)
  concentration?: ConcentrationDto;

  @ApiPropertyOptional({ example: 1, minimum: 1, maximum: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  exhaustion?: number;

  // Limited-use class/race resources (VEG-409). Whitelisted so the sheet's
  // resource-tracker PATCHes pass forbidNonWhitelisted (the VEG-349 lesson).
  @ApiPropertyOptional({ type: [ResourceDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ResourceDto)
  resources?: ResourceDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  campaignId?: string;
}
