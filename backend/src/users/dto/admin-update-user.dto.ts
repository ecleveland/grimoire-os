import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

export class AdminUpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const)
) {}
