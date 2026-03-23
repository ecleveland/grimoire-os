import { OmitType, PartialType } from "@nestjs/mapped-types";
import { CreateNoteDto } from "./create-note.dto";

export class UpdateNoteDto extends PartialType(
  OmitType(CreateNoteDto, ["campaignId"] as const),
) {}
