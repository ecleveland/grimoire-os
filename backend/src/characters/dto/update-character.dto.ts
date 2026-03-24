import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateCharacterDto } from './create-character.dto';

export class UpdateCharacterDto extends PartialType(
  OmitType(CreateCharacterDto, ['campaignId'] as const)
) {}
