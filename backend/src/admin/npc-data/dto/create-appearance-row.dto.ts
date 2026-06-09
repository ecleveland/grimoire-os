import { ApiProperty } from '@nestjs/swagger';
import { IsNonBlankString } from '../../../common/validators/non-blank-string.decorator';

export class CreateAppearanceRowDto {
  @ApiProperty({ example: 'Dwarf' })
  @IsNonBlankString()
  race!: string;

  @ApiProperty({ example: 'hair' })
  @IsNonBlankString()
  category!: string;

  @ApiProperty({ example: 'A braided copper beard.' })
  @IsNonBlankString()
  trait!: string;
}
