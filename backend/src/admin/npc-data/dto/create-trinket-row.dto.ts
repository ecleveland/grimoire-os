import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTrinketRowDto {
  @ApiProperty({ example: 'A glass eye that always faces north.' })
  @IsString()
  @Matches(/\S/, { message: 'description is required' })
  description!: string;
}
