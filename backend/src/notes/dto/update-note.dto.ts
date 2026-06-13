import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional } from 'class-validator';
import { CreateNoteDto } from './create-note.dto';

export class UpdateNoteDto extends PartialType(
  OmitType(CreateNoteDto, ['campaignId', 'sessionNumber'] as const)
) {
  // Redeclared to accept an explicit null: absent = unchanged, null = clear
  // (VEG-316). The union type erases the reflected design type, so @Type
  // keeps the numeric-string coercion the implicit-conversion pipe provided.
  @ApiPropertyOptional({ example: 1, type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sessionNumber?: number | null;
}
