import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LOOT_CR_BUCKETS } from '@grimoire-os/shared';
import { IsNonBlankString } from '../../../common/validators/non-blank-string.decorator';
import { IsLootRange } from '../../../common/validators/loot-range.decorator';

export class LootCoinageDto {
  @ApiProperty({ example: [0, 2], description: 'Inclusive [min, max] gp rolled per generation' })
  @IsLootRange({ floor: 0 })
  gp!: [number, number];

  @ApiProperty({ example: [2, 8] })
  @IsLootRange({ floor: 0 })
  sp!: [number, number];

  @ApiProperty({ example: [4, 20] })
  @IsLootRange({ floor: 0 })
  cp!: [number, number];
}

export class LootTemplateItemDto {
  @ApiProperty({
    example: 'Dagger',
    description: 'Exact catalog Item.name — generation resolves the id by name',
  })
  @IsNonBlankString()
  itemName!: string;

  @ApiProperty({ example: 60, description: 'Relative pick weight (≥ 0)' })
  @IsNumber()
  @Min(0)
  weight!: number;

  @ApiProperty({ example: [1, 1], description: 'Inclusive [min, max] quantity per pick' })
  @IsLootRange({ floor: 1 })
  qty!: [number, number];
}

export class CreateLootTemplateRowDto {
  @ApiProperty({ example: 'merchant' })
  @IsNonBlankString()
  profession!: string;

  @ApiProperty({ enum: LOOT_CR_BUCKETS, example: '2–4' })
  @IsIn(LOOT_CR_BUCKETS, { message: `crBucket must be one of ${LOOT_CR_BUCKETS.join('|')}` })
  crBucket!: string;

  @ApiProperty({ type: LootCoinageDto })
  @IsObject({ message: 'coinage must be an object' })
  @ValidateNested()
  @Type(() => LootCoinageDto)
  coinage!: LootCoinageDto;

  @ApiProperty({ type: [LootTemplateItemDto] })
  @IsArray({ message: 'items must be an array' })
  @ArrayMinSize(1, { message: 'items must contain at least one item entry' })
  @ValidateNested({ each: true })
  @Type(() => LootTemplateItemDto)
  items!: LootTemplateItemDto[];
}
