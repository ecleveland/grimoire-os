import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';
import { IsNonBlankString } from '../../common/validators/non-blank-string.decorator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password', 'role', 'email', 'displayName'] as const)
) {
  // Redeclared to accept an explicit null: absent = unchanged, null = clear
  // (VEG-316).
  @ApiPropertyOptional({ example: 'gandalf@middleearth.com', type: String, nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  // Redeclared to reject blank values: the column is non-nullable, so an
  // empty update would blank the user's name instead of clearing it.
  @ApiPropertyOptional({ example: 'Gandalf the Grey' })
  @IsOptional()
  @IsNonBlankString()
  displayName?: string;
}
