import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStrictBoolean } from '../../common/validators/is-strict-boolean.decorator';

/**
 * Structured coin price (VEG-352 `Currency`). Mirrors the file-local CurrencyDto
 * in the characters module — there is no shared/exported validator class yet.
 * Every denomination is optional so a free item is `{}` (or `{ gp: 0 }`).
 */
class CurrencyDto {
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cp?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sp?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  ep?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  gp?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pp?: number;
}

/**
 * A single stocked line in a shop. `itemId` optionally links the catalog;
 * `name`/`category` are denormalized snapshots. `stock` is `null` for unlimited
 * stock, otherwise a non-negative integer (0 = sold out).
 */
export class ShopLineItemDto {
  @ApiPropertyOptional({ description: 'Optional link to the Item catalog row' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  itemId?: string | null;

  @ApiProperty({ example: 'Potion of Healing' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Potion' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ type: CurrencyDto })
  @ValidateNested()
  @Type(() => CurrencyDto)
  price!: CurrencyDto;

  @ApiPropertyOptional({ description: 'Remaining quantity; null = unlimited', example: 5 })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  stock?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateShopDto {
  @ApiProperty()
  @IsUUID()
  campaignId!: string;

  @ApiProperty({ example: "Maelin's Apothecary" })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'alchemist' })
  @IsString()
  theme!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Theming icon key for the storefront card' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Theming accent colour for the storefront card' })
  @IsOptional()
  @IsString()
  accent?: string;

  @ApiPropertyOptional({ type: [ShopLineItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShopLineItemDto)
  items?: ShopLineItemDto[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsStrictBoolean()
  isOpen?: boolean;
}
