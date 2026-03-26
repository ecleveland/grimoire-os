import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

export class AdminUpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const)
) {}
