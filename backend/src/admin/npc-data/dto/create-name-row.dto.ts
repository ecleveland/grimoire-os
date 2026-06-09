import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNonBlankString } from '../../../common/validators/non-blank-string.decorator';

export class CreateNameRowDto {
  @ApiProperty({ example: 'Elf' })
  @IsNonBlankString()
  race!: string;

  @ApiPropertyOptional({ example: 'female' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiProperty({ example: 'first' })
  @IsNonBlankString()
  kind!: string;

  @ApiProperty({ example: 'Arannis' })
  @IsNonBlankString()
  value!: string;
}
