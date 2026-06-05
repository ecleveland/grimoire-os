import { IsArray, IsIn, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PRINTABLE_CARD_TYPES } from '@grimoire-os/shared';
import type { PrintableCardType } from '@grimoire-os/shared';

export class PrintCardSelectionDto {
  @ApiProperty({ enum: PRINTABLE_CARD_TYPES, example: 'monster' })
  @IsIn(PRINTABLE_CARD_TYPES)
  type!: PrintableCardType;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];
}

export class HydratePrintCardsDto {
  @ApiProperty({
    type: [PrintCardSelectionDto],
    description:
      'Grouped print selection. Total ids across all selections is capped at ' +
      'PRINTABLE_CARD_BATCH_MAX (100); unknown ids are silently dropped.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrintCardSelectionDto)
  selections!: PrintCardSelectionDto[];
}
