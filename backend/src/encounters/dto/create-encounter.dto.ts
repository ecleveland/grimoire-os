import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { LootItemSource } from '@grimoire-os/shared';

const LOOT_ITEM_SOURCES: LootItemSource[] = ['profession', 'trinket', 'magic-item', 'monster'];

// The loot shapes below mirror shared CombatantLoot (VEG-300). They must stay
// whitelisted here: the global ValidationPipe runs with forbidNonWhitelisted,
// and clients echo whole combatants back on every encounter PATCH — an
// undeclared property the server itself persisted would 400 those writes.
class CombatantLootCoinageDto {
  @ApiProperty()
  @IsInt()
  @Min(0)
  gp!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sp!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  cp!: number;
}

class CombatantLootItemDto {
  /** Catalog item id; null for flavor entries with no catalog match. */
  @ApiProperty({ nullable: true, type: String })
  @ValidateIf(o => o.itemId !== null)
  @IsString()
  itemId!: string | null;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ enum: LOOT_ITEM_SOURCES })
  @IsIn(LOOT_ITEM_SOURCES)
  source!: LootItemSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

class CombatantLootDto {
  @ApiProperty()
  @ValidateNested()
  @Type(() => CombatantLootCoinageDto)
  coinage!: CombatantLootCoinageDto;

  @ApiProperty({ type: [CombatantLootItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CombatantLootItemDto)
  items!: CombatantLootItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rolledAt?: string;
}

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

  @ApiPropertyOptional({
    description:
      'Temporary hit points (VEG-286). Damage spends these before real HP; grants take the higher value (5e non-stacking).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  tempHp?: number;

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

  @ApiPropertyOptional({
    description:
      'SRD monster this combatant was created from (VEG-258); manual combatants omit it.',
  })
  @IsOptional()
  @IsString()
  monsterId?: string;

  @ApiPropertyOptional({
    description: 'Loot rolled from the source monster (VEG-300); set by POST /encounters/:id/loot.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CombatantLootDto)
  loot?: CombatantLootDto;
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
