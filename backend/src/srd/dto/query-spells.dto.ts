import { IsOptional, IsString, IsInt } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QuerySpellsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  class?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  level?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  school?: string;
}
