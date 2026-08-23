import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { MAX_INT4 } from '@grimoire-os/shared';
import { CreateNoteDto } from './create-note.dto';

export class UpdateNoteDto extends PartialType(
  OmitType(CreateNoteDto, ['campaignId', 'sessionNumber'] as const)
) {
  // Redeclared to accept an explicit null: absent = unchanged, null = clear
  // (VEG-316). The union type erases the reflected design type, so @Type
  // keeps the numeric-string coercion the implicit-conversion pipe provided.
  // Bounded like CreateNoteDto.sessionNumber (VEG-496) — same Int column, so
  // the same Prisma 500. @IsOptional() skips null as well as undefined, which
  // keeps the explicit-null clear path above working.
  @ApiPropertyOptional({ example: 1, type: Number, nullable: true })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_INT4)
  sessionNumber?: number | null;
}
