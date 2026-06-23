import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request body for `POST /shops/:id/purchase` (VEG-357). The buyer's character
 * and the shop line (addressed by its index in `items`) plus how many to buy.
 * `expected*Version` are optional optimistic-lock echoes — when omitted the
 * service still guards on the version it reads, so a purchase can never oversell
 * or double-spend off a stale snapshot.
 */
export class PurchaseDto {
  @ApiProperty({ description: "The buyer's character (must be the caller's own)" })
  @IsUUID()
  characterId!: string;

  @ApiProperty({ description: 'Index of the line in the shop `items` array', minimum: 0 })
  @IsInt()
  @Min(0)
  itemIndex!: number;

  @ApiProperty({ minimum: 1, default: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Optimistic-lock guard for the shop' })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedShopVersion?: number;

  @ApiPropertyOptional({ description: 'Optimistic-lock guard for the character' })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedCharacterVersion?: number;
}
