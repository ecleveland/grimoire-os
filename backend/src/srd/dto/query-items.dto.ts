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

  /**
   * Restrict the search to the global catalog (srd + shared), leaving out the
   * caller's own homebrew. Pickers that feed a write validated against the
   * global tier (loot templates) request this so the page they show never
   * offers a row the save would refuse.
   */
  @ApiPropertyOptional({
    enum: ['global'],
    description: 'Search the srd + shared catalog only, excluding the caller\u2019s homebrew',
  })
  @IsOptional()
  @IsIn(['global'])
  tier?: 'global';
}
