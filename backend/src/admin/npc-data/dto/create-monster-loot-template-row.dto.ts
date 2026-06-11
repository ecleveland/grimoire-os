import { IsIn } from 'class-validator';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { MONSTER_LOOT_TYPE_KEYS } from '@grimoire-os/shared';
import type { MonsterLootTypeKey } from '@grimoire-os/shared';
import { CreateLootTemplateRowDto } from './create-loot-template-row.dto';

/**
 * Create body for the `monster-loot` admin table. Monster templates reuse the
 * NpcLootTemplate row shape (the type key is stored in the shared
 * `profession` column), so everything but the selection key is inherited
 * from CreateLootTemplateRowDto via OmitType — validation and Swagger
 * metadata included, so the two families' shared rules cannot drift. Unlike
 * NPC professions, the type key is a closed set: all monsters in the system
 * carry canonical SRD types, so the engine only selects on these keys plus
 * the generic fallback, and free text would create unreachable rows. (If
 * homebrew monsters with custom types ever land, revisit this closed set.)
 */
export class CreateMonsterLootTemplateRowDto extends OmitType(CreateLootTemplateRowDto, [
  'profession',
] as const) {
  @ApiProperty({ enum: MONSTER_LOOT_TYPE_KEYS, example: 'dragon' })
  @IsIn(MONSTER_LOOT_TYPE_KEYS, {
    message: `type must be one of ${MONSTER_LOOT_TYPE_KEYS.join('|')}`,
  })
  type!: MonsterLootTypeKey;
}
