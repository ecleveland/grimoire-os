import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsObject, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  LOOT_CR_BUCKETS,
  MONSTER_LOOT_GENERIC_TYPE,
  MONSTER_LOOT_TYPES,
} from '@grimoire-os/shared';
import type { LootCrBucket } from '@grimoire-os/shared';
import {
  LootCoinageDto,
  LootTemplateItemDto,
  ValidItemEntrySet,
} from './create-loot-template-row.dto';

const MONSTER_LOOT_TYPE_KEYS = [...MONSTER_LOOT_TYPES, MONSTER_LOOT_GENERIC_TYPE] as const;

/**
 * Create body for the `monster-loot` admin table. Monster templates reuse the
 * NpcLootTemplate row shape (the type key is stored in the shared
 * `profession` column), so everything but the selection key matches
 * CreateLootTemplateRowDto. Unlike NPC professions, the type key is a closed
 * set — the loot engine only ever selects on the canonical creature types
 * plus the generic fallback, so free text would create unreachable rows.
 */
export class CreateMonsterLootTemplateRowDto {
  @ApiProperty({ enum: MONSTER_LOOT_TYPE_KEYS, example: 'dragon' })
  @IsIn(MONSTER_LOOT_TYPE_KEYS, {
    message: `type must be one of ${MONSTER_LOOT_TYPE_KEYS.join('|')}`,
  })
  type!: string;

  @ApiProperty({ enum: LOOT_CR_BUCKETS, example: '11+' })
  @IsIn(LOOT_CR_BUCKETS, { message: `crBucket must be one of ${LOOT_CR_BUCKETS.join('|')}` })
  crBucket!: LootCrBucket;

  @ApiProperty({ type: LootCoinageDto })
  @IsObject({ message: 'coinage must be an object' })
  @ValidateNested()
  @Type(() => LootCoinageDto)
  coinage!: LootCoinageDto;

  @ApiProperty({ type: [LootTemplateItemDto] })
  @IsArray({ message: 'items must be an array' })
  @ArrayMinSize(1, { message: 'items must contain at least one item entry' })
  @ValidItemEntrySet()
  @ValidateNested({ each: true })
  @Type(() => LootTemplateItemDto)
  items!: LootTemplateItemDto[];
}
