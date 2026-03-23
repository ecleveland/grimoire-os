import {
  IsString,
  MinLength,
  IsOptional,
  IsEmail,
  IsUrl,
  IsEnum,
} from "class-validator";
import { UserRole } from "../../prisma/enums";

export class CreateUserDto {
  @IsString()
  username: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
