import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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
  // Restore the raw body value: without this, the global pipe's
  // enableImplicitConversion coerces any non-empty string (including 'false')
  // to true before @IsBoolean runs. The transform's `value` is already
  // coerced; only `obj` still holds the original. (Same fix as VEG-314.)
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.stealthDisadvantage)
  @IsBoolean()
  stealthDisadvantage?: boolean;

  @ApiPropertyOptional({ example: 13 })
  @IsOptional()
  @IsInt()
  @Min(0)
  strengthRequirement?: number;

  @ApiPropertyOptional({ example: ['Finesse', 'Light'] })
  @IsOptional()
  @IsArray()
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
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.requiresAttunement)
  @IsBoolean()
  requiresAttunement?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.isMagic)
  @IsBoolean()
  isMagic?: boolean;
}
