import { IsBooleanString, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryFeatsDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Free-text search across name and description' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Feat category filter (e.g. Origin, General)' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description: 'When "true", only feats with a prerequisite. When "false", only feats without.',
  })
  @IsOptional()
  @IsBooleanString()
  hasPrerequisite?: string;

  @ApiPropertyOptional({
    description: 'When "true", only repeatable feats. When "false", non-repeatable.',
  })
  @IsOptional()
  @IsBooleanString()
  repeatable?: string;
}
