import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Body of a hand-saved snapshot. */
export class CreateCharacterSnapshotDto {
  /** Trimmed before validation. A blank label saves the snapshot with none. */
  @ApiPropertyOptional({ maxLength: 60, example: 'Before the dragon fight' })
  @IsOptional()
  @Transform(({ value }) => {
    // Leave a non-string alone so @IsString rejects it.
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @IsString()
  @MaxLength(60)
  label?: string;
}
