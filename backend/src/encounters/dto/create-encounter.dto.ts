import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CONDITIONS } from '@grimoire-os/shared';
import type { Condition, LootItemSource } from '@grimoire-os/shared';

const LOOT_ITEM_SOURCES: LootItemSource[] = ['profession', 'trinket', 'magic-item', 'monster'];

// Spread to a mutable array: class-validator's @IsIn types its allowed-values
// param as readonly unknown[], but the `as const` CONDITIONS is a narrower
// readonly tuple — copying keeps the shared const the single source of truth.
const CONDITION_VALUES: Condition[] = [...CONDITIONS];

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

// Concentration tracking (VEG-287). Like the loot shapes, it must stay
// whitelisted here: the tracker echoes whole combatants back on every PATCH,
// so an undeclared property the server persisted would 400 those writes.
class CombatantConcentrationDto {
  @ApiPropertyOptional({ description: 'The spell being concentrated on, if named.' })
  @IsOptional()
  @IsString()
  spell?: string;
}

// Death-saving throws for a downed PC (VEG-288); whitelisted for the same
// echo-back reason as the loot/concentration shapes. Each count is 0–3.
class CombatantDeathSavesDto {
  @ApiProperty({ minimum: 0, maximum: 3 })
  @IsInt()
  @Min(0)
  @Max(3)
  successes!: number;

  @ApiProperty({ minimum: 0, maximum: 3 })
  @IsInt()
  @Min(0)
  @Max(3)
  failures!: number;
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

  @ApiPropertyOptional({
    description: 'Active SRD conditions (VEG-287).',
    enum: CONDITION_VALUES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(CONDITION_VALUES, { each: true })
  conditions?: Condition[];

  @ApiPropertyOptional({
    description: 'Concentration tracking (VEG-287); absent means not concentrating.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CombatantConcentrationDto)
  concentration?: CombatantConcentrationDto;

  @ApiPropertyOptional({ description: 'Exhaustion level 1–6 (VEG-287); absent means none.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  exhaustion?: number;

  @ApiPropertyOptional({
    description: 'Death-saving throws for a downed PC (VEG-288); absent until tracked.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CombatantDeathSavesDto)
  deathSaves?: CombatantDeathSavesDto;
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
