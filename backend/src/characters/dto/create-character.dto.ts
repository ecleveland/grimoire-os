import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsBoolean,
} from "class-validator";
import { Type } from "class-transformer";

class AbilityScoresDto {
  @IsOptional() @IsNumber() strength?: number;
  @IsOptional() @IsNumber() dexterity?: number;
  @IsOptional() @IsNumber() constitution?: number;
  @IsOptional() @IsNumber() intelligence?: number;
  @IsOptional() @IsNumber() wisdom?: number;
  @IsOptional() @IsNumber() charisma?: number;
}

class HitPointsDto {
  @IsOptional() @IsNumber() max?: number;
  @IsOptional() @IsNumber() current?: number;
  @IsOptional() @IsNumber() temporary?: number;
}

class SpellSlotDto {
  @IsNumber() level: number;
  @IsOptional() @IsNumber() total?: number;
  @IsOptional() @IsNumber() used?: number;
}

class InventoryItemDto {
  @IsString() name: string;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() @IsBoolean() equipped?: boolean;
}

class CurrencyDto {
  @IsOptional() @IsNumber() cp?: number;
  @IsOptional() @IsNumber() sp?: number;
  @IsOptional() @IsNumber() ep?: number;
  @IsOptional() @IsNumber() gp?: number;
  @IsOptional() @IsNumber() pp?: number;
}

class FeatureDto {
  @IsString() name: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsString() description?: string;
}

export class CreateCharacterDto {
  @IsString() name: string;

  @IsOptional() @IsString() race?: string;
  @IsOptional() @IsString() class?: string;
  @IsOptional() @IsNumber() level?: number;
  @IsOptional() @IsString() subclass?: string;
  @IsOptional() @IsString() background?: string;
  @IsOptional() @IsString() alignment?: string;
  @IsOptional() @IsNumber() experiencePoints?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AbilityScoresDto)
  abilityScores?: AbilityScoresDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => HitPointsDto)
  hitPoints?: HitPointsDto;

  @IsOptional() @IsNumber() armorClass?: number;
  @IsOptional() @IsNumber() speed?: number;
  @IsOptional() @IsNumber() initiative?: number;

  @IsOptional() @IsArray() @IsString({ each: true }) proficiencies?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) savingThrows?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) skills?: string[];

  @IsOptional() @IsString() spellcastingAbility?: string;
  @IsOptional() @IsNumber() spellSaveDC?: number;
  @IsOptional() @IsNumber() spellAttackBonus?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) knownSpells?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) preparedSpells?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpellSlotDto)
  spellSlots?: SpellSlotDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InventoryItemDto)
  inventory?: InventoryItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CurrencyDto)
  currency?: CurrencyDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureDto)
  features?: FeatureDto[];

  @IsOptional() @IsString() personalityTraits?: string;
  @IsOptional() @IsString() ideals?: string;
  @IsOptional() @IsString() bonds?: string;
  @IsOptional() @IsString() flaws?: string;
  @IsOptional() @IsString() backstory?: string;
  @IsOptional() @IsString() appearance?: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsString() campaignId?: string;
}
