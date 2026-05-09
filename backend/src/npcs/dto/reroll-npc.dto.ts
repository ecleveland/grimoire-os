import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { REROLL_FIELDS, type RerollField } from '../generator/npc-generator.types';

export class RerollNpcDto {
  @ApiProperty({ enum: REROLL_FIELDS })
  @IsIn(REROLL_FIELDS as unknown as string[])
  field!: RerollField;
}
