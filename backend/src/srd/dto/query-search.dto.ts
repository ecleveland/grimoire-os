import { IsOptional, IsString, IsInt, IsIn, IsBooleanString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { SEARCH_KINDS, type SearchKind } from '@grimoire-os/shared';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { FeatureParentType } from './query-features.dto';

export class QuerySearchDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Free-text search across name and description' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated list of kinds to include. Defaults to all (spell, feat, item, class, feature).',
    example: 'spell,class',
  })
  @IsOptional()
  // Both shapes a kind list arrives in run through one filter: `types=a,b` is a
  // string, while a repeated `types=a&types=b` is already an array. An unknown
  // kind left in either would become a source nothing builds, so the search
  // would answer an empty page rather than fall back to the full kind set.
  @Transform(({ value }) => {
    const raw: unknown[] = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(',')
        : [];
    const kinds = raw
      .map(s => String(s).trim())
      .filter((s): s is SearchKind => (SEARCH_KINDS as readonly string[]).includes(s));
    return kinds.length ? kinds : undefined;
  })
  types?: SearchKind[];

  // ── Spell sub-filters ─────────────────────────────────
  @ApiPropertyOptional({ description: 'Spell class filter (only applies when kind=spell)' })
  @IsOptional()
  @IsString()
  class?: string;

  @ApiPropertyOptional({ description: 'Spell level filter' })
  @IsOptional()
  @IsInt()
  level?: number;

  @ApiPropertyOptional({ description: 'Spell school filter' })
  @IsOptional()
  @IsString()
  school?: string;

  // ── Feat sub-filters ──────────────────────────────────
  @ApiPropertyOptional({
    description: 'When "true", only feats with a prerequisite. When "false", only feats without.',
  })
  @IsOptional()
  @IsBooleanString()
  hasPrerequisite?: string;

  @ApiPropertyOptional({
    description: 'Category filter, applied to the feat and item sources',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'When "true", only repeatable feats. When "false", non-repeatable.',
  })
  @IsOptional()
  @IsBooleanString()
  repeatable?: string;

  // ── Item sub-filters ──────────────────────────────────
  @ApiPropertyOptional({ description: 'Item rarity filter (only applies when kind=item)' })
  @IsOptional()
  @IsString()
  rarity?: string;

  @ApiPropertyOptional({
    description: 'When "true", only magic items. When "false", only mundane items.',
  })
  @IsOptional()
  @IsBooleanString()
  isMagic?: string;

  // ── Feature sub-filters ───────────────────────────────
  @ApiPropertyOptional({ enum: ['class', 'subclass', 'race', 'background'] })
  @IsOptional()
  @IsIn(['class', 'subclass', 'race', 'background'])
  parentType?: FeatureParentType;

  @ApiPropertyOptional({ description: 'Filter features by parent entity ID' })
  @IsOptional()
  @IsString()
  parentId?: string;
}
