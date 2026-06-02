import { Expose } from 'class-transformer';
import { NoteVisibility } from '../../prisma/enums';

/** Full note detail payload (VEG-128), including the body `content`. */
export class NoteDto {
  @Expose() id!: string;
  @Expose() campaignId!: string;
  @Expose() authorId!: string;
  @Expose() title!: string;
  @Expose() content!: string | null;
  @Expose() visibility!: NoteVisibility;
  @Expose() sessionNumber!: number | null;
  @Expose() tags!: string[];
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}

/**
 * Slim note shape for list views (VEG-125 projection, VEG-128 DTO). Drops the
 * potentially large `content` body the list never renders.
 */
export class NoteListItemDto {
  @Expose() id!: string;
  @Expose() campaignId!: string;
  @Expose() title!: string;
  @Expose() visibility!: NoteVisibility;
  @Expose() tags!: string[];
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}
