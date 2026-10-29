import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Body of a request to start a new character from a snapshot. */
export class CopyCharacterSnapshotDto {
  /**
   * Trimmed before validation. A blank or missing name falls back to the
   * snapshot's name with its level appended.
   */
  @ApiPropertyOptional({ maxLength: 100, example: 'Thorn Ironforge (level 5)' })
  @IsOptional()
  @Transform(({ value }) => {
    // Leave a non-string alone so @IsString rejects it.
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsString()
  @MaxLength(100)
  name?: string;

  /** The campaign to put the copy in. The caller must be a member of it. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;
}
