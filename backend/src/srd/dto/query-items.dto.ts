import { IsIn, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryItemsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rarity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  isMagic?: string;
}

/** Query for the public item search, which is the only route that scopes by caller. */
export class SearchItemsDto extends QueryItemsDto {
  @ApiPropertyOptional({
    enum: ['global'],
    description:
      "Search the SRD and shared catalog only, leaving out the caller's homebrew. Pickers that feed a write validated against the global tier request this.",
  })
  @IsOptional()
  @IsIn(['global'])
  tier?: 'global';
}
