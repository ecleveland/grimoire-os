import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  Min,
  registerDecorator,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LOOT_CR_BUCKETS } from '@grimoire-os/shared';
import type { LootCrBucket } from '@grimoire-os/shared';
import { IsNonBlankString } from '../../../common/validators/non-blank-string.decorator';
import { IsLootRange } from '../../../common/validators/loot-range.decorator';

// Array-level item-entry invariants the per-entry decorators can't see.
// All-zero weights would make the roller's weightedPick throw at generation
// time; duplicate names would silently stack pick weight (and the editor
// keys its rows by name).
function ValidItemEntrySet(validationOptions?: ValidationOptions): PropertyDecorator {
  return function (target: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'validItemEntrySet',
      target: target.constructor,
      propertyName: propertyName as string,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) return true; // IsArray reports that case
          const entries = value as { itemName?: unknown; weight?: unknown }[];
          const names = entries.map(e => e.itemName);
          if (new Set(names).size !== names.length) return false;
          return entries.some(e => typeof e.weight === 'number' && e.weight > 0);
        },
        defaultMessage(): string {
          return 'items must have unique itemName values and at least one entry with weight > 0';
        },
      },
    });
  };
}

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
