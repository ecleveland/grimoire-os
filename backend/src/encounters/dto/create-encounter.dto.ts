import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CombatantDto {
  @ApiProperty({ example: 'Goblin' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  initiative?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  hp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxHp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  ac?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isNpc?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateEncounterDto {
  @ApiProperty()
  @IsString()
  campaignId!: string;

  @ApiProperty({ example: 'Ambush at the Bridge' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ type: [CombatantDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CombatantDto)
  combatants?: CombatantDto[];
}
