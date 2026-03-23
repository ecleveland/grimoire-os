import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
} from "class-validator";
import { NoteVisibility } from "../../prisma/enums";

export class CreateNoteDto {
  @IsString()
  campaignId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(NoteVisibility)
  visibility?: NoteVisibility;

  @IsOptional()
  @IsNumber()
  sessionNumber?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
