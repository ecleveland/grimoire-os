import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAppearanceRowDto {
  @ApiProperty({ example: 'Dwarf' })
  @IsString()
  @Matches(/\S/, { message: 'race is required' })
  race!: string;

  @ApiProperty({ example: 'hair' })
  @IsString()
  @Matches(/\S/, { message: 'category is required' })
  category!: string;

  @ApiProperty({ example: 'A braided copper beard.' })
  @IsString()
  @Matches(/\S/, { message: 'trait is required' })
  trait!: string;
}
