import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { Currency } from '@grimoire-os/shared';

/**
 * A structured coin amount: a character's purse or a shop line's price. Every
 * denomination is optional, so a free item is `{}` (or `{ gp: 0 }`), and each
 * one present must be a non-negative integer.
 *
 * `Partial` because the shared type requires all five denominations and this
 * DTO does not. The key-set check that catches a renamed denomination lives
 * with the other mirror assertions in `create-character.dto.ts`.
 */
export class CurrencyDto implements Partial<Currency> {
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
