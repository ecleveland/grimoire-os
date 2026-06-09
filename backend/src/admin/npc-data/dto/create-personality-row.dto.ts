import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PERSONALITY_KINDS } from '../admin-npc-data.types';
import type { PersonalityKind } from '../admin-npc-data.types';
import { IsNonBlankString } from '../../../common/validators/non-blank-string.decorator';

export class CreatePersonalityRowDto {
  @ApiProperty({ example: 'Acolyte' })
  @IsNonBlankString()
  background!: string;

  @ApiProperty({ enum: PERSONALITY_KINDS, example: 'ideals' })
  @IsIn(PERSONALITY_KINDS, {
    message: 'kind must be one of personalityTraits|ideals|bonds|flaws',
  })
  kind!: PersonalityKind;

  @ApiProperty({ example: 'Faith above all.' })
  @IsNonBlankString()
  value!: string;
}
