import { IsIn, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PERSONALITY_KINDS } from '../admin-npc-data.types';
import type { PersonalityKind } from '../admin-npc-data.types';

export class CreatePersonalityRowDto {
  @ApiProperty({ example: 'Acolyte' })
  @IsString()
  @Matches(/\S/, { message: 'background is required' })
  background!: string;

  @ApiProperty({ enum: PERSONALITY_KINDS, example: 'ideals' })
  @IsIn(PERSONALITY_KINDS, {
    message: 'kind must be one of personalityTraits|ideals|bonds|flaws',
  })
  kind!: PersonalityKind;

  @ApiProperty({ example: 'Faith above all.' })
  @IsString()
  @Matches(/\S/, { message: 'value is required' })
  value!: string;
}
