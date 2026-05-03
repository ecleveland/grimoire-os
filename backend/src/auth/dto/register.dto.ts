import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail } from 'class-validator';
import {
  IsStrongPassword,
  PASSWORD_MIN_LENGTH,
} from '../../common/validators/strong-password.decorator';

export class RegisterDto {
  @ApiProperty({ example: 'gandalf' })
  @IsString()
  username!: string;

  @ApiProperty({
    example: 'YouShallN0tPass!',
    minLength: PASSWORD_MIN_LENGTH,
    description:
      'Must be at least 10 characters and contain uppercase, lowercase, number, and special character',
  })
  @IsStrongPassword()
  password!: string;

  @ApiPropertyOptional({ example: 'Gandalf the Grey' })
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional({ example: 'gandalf@middleearth.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}
