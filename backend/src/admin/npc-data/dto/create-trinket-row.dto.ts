import { ApiProperty } from '@nestjs/swagger';
import { IsNonBlankString } from '../../../common/validators/non-blank-string.decorator';

export class CreateTrinketRowDto {
  @ApiProperty({ example: 'A glass eye that always faces north.' })
  @IsNonBlankString()
  description!: string;
}
