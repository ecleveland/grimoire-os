import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class QueryNotesDto extends PaginationDto {
  @ApiProperty()
  @IsUUID()
  campaignId!: string;
}
