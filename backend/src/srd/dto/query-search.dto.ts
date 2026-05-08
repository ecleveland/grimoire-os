import { IsOptional, IsString, IsInt, IsIn, IsBooleanString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { FeatureParentType } from './query-features.dto';

export type SearchKind = 'spell' | 'feat' | 'feature';

const ALL_KINDS: SearchKind[] = ['spell', 'feat', 'feature'];

export class QuerySearchDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Free-text search across name and description' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated list of kinds to include. Defaults to all (spell, feat, feature).',
    example: 'spell,feature',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return undefined;
    const kinds = value
      .split(',')
      .map(s => s.trim())
      .filter((s): s is SearchKind => (ALL_KINDS as string[]).includes(s));
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

  @ApiPropertyOptional({ description: 'Feat category filter (only applies when kind=feat)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'When "true", only repeatable feats. When "false", non-repeatable.',
  })
  @IsOptional()
  @IsBooleanString()
  repeatable?: string;

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
