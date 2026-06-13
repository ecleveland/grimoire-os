import { IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { LootCrBucket } from '@grimoire-os/shared';
import { IsCrChanceMap } from '../../../common/validators/cr-chance-map.decorator';
import { IsDieSpec } from '../../../common/validators/die-spec.decorator';

// A generous sanity ceiling on the coinage multiplier: anything above this is
// almost certainly a fat-fingered extra zero (a typo'd 100 instead of 1.0
// would 100× every coin drop going forward) rather than an intended tuning.
const MAX_COINAGE_MULTIPLIER = 100;

// Partial update of the global loot-tuning knobs (the `npc-generation`
// GameRule rows). Chances are stored and validated as fractions in [0, 1];
// the admin UI presents them as percentages and converts at the boundary.
// Every field is optional so a save can touch a single knob, but the UI sends
// all four.
export class UpdateLootOddsDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 1, description: 'Trinket drop chance (0–1)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  trinketChance?: number;

  @ApiPropertyOptional({
    description:
      'Magic-item chance per CR bucket, each a probability 0–1. Must be the ' +
      'complete bucket set when present (the engine stores it wholesale).',
    example: { '0': 0.001, '0–1': 0.005, '2–4': 0.02, '5–10': 0.05, '11+': 0.15 },
  })
  @IsOptional()
  @IsObject()
  @IsCrChanceMap()
  magicItemChanceByCr?: Record<LootCrBucket, number>;

  @ApiPropertyOptional({ example: '1d3', description: 'Item-count die spec' })
  @IsOptional()
  @IsDieSpec()
  itemCountDie?: string;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: MAX_COINAGE_MULTIPLIER,
    description: 'Coinage multiplier (0–100)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_COINAGE_MULTIPLIER)
  coinageMultiplier?: number;
}
