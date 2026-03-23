import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

class CombatantDto {
  @IsString() name!: string;
  @IsOptional() @IsNumber() initiative?: number;
  @IsOptional() @IsNumber() hp?: number;
  @IsOptional() @IsNumber() maxHp?: number;
  @IsOptional() @IsNumber() ac?: number;
  @IsOptional() @IsBoolean() isNpc?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class CreateEncounterDto {
  @IsString()
  campaignId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CombatantDto)
  combatants?: CombatantDto[];
}
