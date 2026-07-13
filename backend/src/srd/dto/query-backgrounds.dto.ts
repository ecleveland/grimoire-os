import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query for the background list. Deliberately unpaginated (unlike feats): the
 * catalog is a small closed set (~16 SRD rows + a user's own homebrew) and four
 * consumers (character-builder pickers, editor form, unified search) are typed
 * against the bare `SrdBackground[]` array shape.
 */
export class QueryBackgroundsDto {
  @ApiPropertyOptional({ description: 'Free-text search across name and description' })
  @IsOptional()
  @IsString()
  q?: string;
}
