import { IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export type FeatureParentType = 'class' | 'subclass' | 'race' | 'background';

export class QueryFeaturesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: ['class', 'subclass', 'race', 'background'] })
  @IsOptional()
  @IsIn(['class', 'subclass', 'race', 'background'])
  parentType?: FeatureParentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentId?: string;
}
