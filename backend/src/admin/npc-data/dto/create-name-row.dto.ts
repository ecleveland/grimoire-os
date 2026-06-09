import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateNameRowDto {
  @ApiProperty({ example: 'Elf' })
  @IsString()
  @Matches(/\S/, { message: 'race is required' })
  race!: string;

  @ApiPropertyOptional({ example: 'female' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty({ example: 'first' })
  @IsString()
  @Matches(/\S/, { message: 'kind is required' })
  kind!: string;

  @ApiProperty({ example: 'Arannis' })
  @IsString()
  @Matches(/\S/, { message: 'value is required' })
  value!: string;
}
