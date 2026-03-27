import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum, IsNumber, IsArray } from 'class-validator';
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

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  sessionNumber?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
