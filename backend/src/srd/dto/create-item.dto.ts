import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsStrictBoolean } from '../../common/validators/is-strict-boolean.decorator';

/**
 * Body for creating a homebrew item (VEG-296). Mirrors the SRD item shape;
 * ownership/tier fields are never accepted from the client — the service
 * stamps `contentSource: 'homebrew'` and the actor's `createdById`.
 */
export class CreateItemDto {
  @ApiProperty({ example: 'Cloak of Whispers' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: 'Wondrous Item' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category!: string;

  @ApiPropertyOptional({ example: '500 gp' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  cost?: string;

  @ApiPropertyOptional({ example: 2.5, description: 'Weight in pounds' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ example: 'A cloak woven from twilight that muffles every footstep.' })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @ApiPropertyOptional({ example: '1d4' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  damage?: string;

  @ApiPropertyOptional({ example: 'Psychic' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  damageType?: string;

  @ApiPropertyOptional({
    example: '12 + Dex modifier',
    description: 'Wearable-armor AC as self-describing text (matches the SRD item shape)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  armorClass?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsStrictBoolean()
  stealthDisadvantage?: boolean;

  @ApiPropertyOptional({ example: 13 })
  @IsOptional()
  @IsInt()
  @Min(0)
  strengthRequirement?: number;

  @ApiPropertyOptional({ example: ['Finesse', 'Light'] })
  @IsOptional()
  @IsArray()
  // Every scalar field is length-capped; cap the one collection too so the
  // payload can't smuggle unbounded data past validation. SRD items top out
  // at a handful of properties — 50 is generous.
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  properties?: string[];

  @ApiPropertyOptional({ example: 'Rare' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  rarity?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsStrictBoolean()
  requiresAttunement?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsStrictBoolean()
  isMagic?: boolean;
}
