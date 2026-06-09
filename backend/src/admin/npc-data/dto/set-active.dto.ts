import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetActiveDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isActive!: boolean;
}
