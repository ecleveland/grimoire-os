import { IsString, IsOptional, IsEmail, IsUrl, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../prisma/enums';
import {
  IsStrongPassword,
  PASSWORD_MIN_LENGTH,
} from '../../common/validators/strong-password.decorator';

export class CreateUserDto {
  @ApiProperty({ example: 'gandalf' })
  @IsString()
  username!: string;

  @ApiProperty({
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
