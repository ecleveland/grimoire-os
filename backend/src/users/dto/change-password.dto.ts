import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsStrongPassword,
  PASSWORD_MIN_LENGTH,
} from '../../common/validators/strong-password.decorator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({
    minLength: PASSWORD_MIN_LENGTH,
    description:
      'Must be at least 10 characters and contain uppercase, lowercase, number, and special character',
  })
  @IsStrongPassword()
  newPassword!: string;
}
