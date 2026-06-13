import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'role', 'email'] as const)
) {
  // Redeclared to accept an explicit null: absent = unchanged, null = clear
  // (VEG-316).
  @ApiPropertyOptional({ example: 'gandalf@middleearth.com', type: String, nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string | null;
}
