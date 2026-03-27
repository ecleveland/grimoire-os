import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional, IsEmail } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'gandalf' })
  @IsString()
  username!: string;

  @ApiProperty({ example: 'YouShallN0tPass!' })
  @IsString()
  @MinLength(8)
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
