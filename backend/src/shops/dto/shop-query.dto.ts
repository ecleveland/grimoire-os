import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ShopFilterDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  theme?: string;

  @ApiPropertyOptional({ description: 'Case-insensitive name substring match' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ShopQueryDto extends ShopFilterDto {
  @ApiProperty()
  @IsUUID()
  campaignId!: string;
}
