import { IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsCrChanceMap } from '../../../common/validators/cr-chance-map.decorator';
import { IsDieSpec } from '../../../common/validators/die-spec.decorator';

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
    description: 'Magic-item chance per CR bucket, each a probability 0–1',
    example: { '0': 0.001, '0–1': 0.005, '2–4': 0.02, '5–10': 0.05, '11+': 0.15 },
  })
  @IsOptional()
  @IsObject()
  @IsCrChanceMap()
  magicItemChanceByCr?: Record<string, number>;

  @ApiPropertyOptional({ example: '1d3', description: 'Item-count die spec' })
  @IsOptional()
  @IsDieSpec()
  itemCountDie?: string;

  @ApiPropertyOptional({ minimum: 0, description: 'Coinage multiplier (≥ 0)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  coinageMultiplier?: number;
}
