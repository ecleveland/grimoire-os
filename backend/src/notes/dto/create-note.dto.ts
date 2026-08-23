import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsInt, IsArray, Min, Max } from 'class-validator';
import { MAX_INT4 } from '@grimoire-os/shared';
import { NoteVisibility } from '../../prisma/enums';

export class CreateNoteDto {
  @ApiProperty()
  @IsString()
  campaignId!: string;

  @ApiProperty({ example: 'Session 1 Notes' })
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ enum: NoteVisibility })
  @IsOptional()
  @IsEnum(NoteVisibility)
  visibility?: NoteVisibility;

  // Same Int-column boundary as campaign.currentSession (VEG-496). Floored at
  // 0 rather than 1: session zero is a real thing people write notes about.
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_INT4)
  sessionNumber?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
