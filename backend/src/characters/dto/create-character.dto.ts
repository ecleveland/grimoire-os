import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Feature } from '@grimoire-os/shared';

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
  @IsBoolean()
  equipped?: boolean;
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
  @ApiProperty({ example: 'd10' })
  @IsString()
  dieType!: string;

  @ApiProperty({ example: 8 })
  @IsNumber()
  total!: number;

  @ApiProperty({ example: 2 })
  @IsNumber()
  spent!: number;
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

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
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

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  knownSpells?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preparedSpells?: string[];

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
  @IsBoolean()
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  campaignId?: string;
}
