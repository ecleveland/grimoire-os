import { ApiProperty } from '@nestjs/swagger';
import { IsStrictBoolean } from '../../../common/validators/is-strict-boolean.decorator';

export class SetActiveDto {
  @ApiProperty({ example: false })
  @IsStrictBoolean()
  isActive!: boolean;
}
