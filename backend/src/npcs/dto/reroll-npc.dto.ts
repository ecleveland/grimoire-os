import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { REROLL_FIELDS, type RerollField } from '../generator/npc-generator.types';
import { LootOverridesDto } from './generate-npc.dto';

export class RerollNpcDto {
  @ApiProperty({ enum: REROLL_FIELDS })
  @IsIn(REROLL_FIELDS as unknown as string[])
  field!: RerollField;

  @ApiPropertyOptional({
    type: LootOverridesDto,
    nullable: true,
    description:
      'Only valid with field "loot". Merged into the NPC\'s saved loot odds for this roll and persisted for future rolls; an explicit null clears the saved odds back to base rules.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LootOverridesDto)
  lootOverrides?: LootOverridesDto | null;
}
