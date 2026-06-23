import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// A sane upper bound on a single purchase: large enough for any real bulk buy,
// small enough that price × quantity can't approach number-precision limits.
const MAX_PURCHASE_QUANTITY = 100_000;

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

  @ApiProperty({ minimum: 1, maximum: MAX_PURCHASE_QUANTITY, default: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_PURCHASE_QUANTITY)
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
