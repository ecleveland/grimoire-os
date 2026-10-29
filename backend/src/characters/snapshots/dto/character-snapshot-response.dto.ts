import { Expose, Type } from 'class-transformer';
import { CharacterDto } from '../../dto/character-response.dto';

/** One row of a character's snapshot list, without the stored sheet. */
export class CharacterSnapshotSummaryDto {
  @Expose() id!: string;
  @Expose() level!: number;
  @Expose() label!: string | null;
  @Expose() takenAt!: Date;
}

/**
 * A snapshot with its sheet. `data` is the stored row rebuilt into a full
 * character payload, `computed` block included, so a reader renders it the same
 * way it renders the live character. `@Type` runs it through the
 * `CharacterDto` whitelist as well.
 */
export class CharacterSnapshotDto extends CharacterSnapshotSummaryDto {
  @Expose()
  @Type(() => CharacterDto)
  data!: CharacterDto;
}
