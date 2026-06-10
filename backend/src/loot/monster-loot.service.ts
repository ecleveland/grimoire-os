// Injectable wiring for monster loot rolls (VEG-300): loads the monster-
// category templates plus the shared catalog data and exposes a roller that
// maps a monster's type × CR onto the pure loot engine (VEG-297/VEG-298).

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SeededRng } from '../common/helpers/seeded-rng';
import { LootRoller } from './loot-roller';
import { createMonsterLootTemplateSelector, monsterToLootSelection } from './monster-loot';
import { LOOT_GAME_RULE_CATEGORY, resolveLootGameRules } from './loot-game-rules';
import { GeneratedLoot, LootItemRef, LootTemplate } from './loot.types';

export type MonsterLootInput = { type: string; challengeRating: number };

/** A roller bound to a loaded data snapshot; cheap to call per combatant. */
export interface MonsterLootRoller {
  rollForMonster(monster: MonsterLootInput, rng: SeededRng): GeneratedLoot;
}

@Injectable()
export class MonsterLootService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads a snapshot of monster templates, trinkets, the item catalog, and
   * the loot game rules, and returns a roller over it. One load per request,
   * shared across all combatants of a roll — the dataset is small (same
   * trade-off as NpcRefDataLoader).
   */
  async loadRoller(): Promise<MonsterLootRoller> {
    const [templates, trinkets, items, gameRules] = await Promise.all([
      // crBucket asc imposes the deterministic order the selector's
      // any-bucket fallback relies on: the poorest bucket comes first (see
      // seed/data/monster-loot-templates.ts).
      this.prisma.npcLootTemplate.findMany({
        where: { isActive: true, category: 'monster' },
        orderBy: { crBucket: 'asc' },
      }),
      this.prisma.trinket.findMany({ where: { isActive: true }, select: { description: true } }),
      this.prisma.item.findMany({ select: { id: true, name: true, isMagic: true } }),
      this.prisma.gameRule.findMany({ where: { category: LOOT_GAME_RULE_CATEGORY } }),
    ]);

    const itemsByName = new Map<string, LootItemRef>();
    const magicItems: LootItemRef[] = [];
    for (const item of items) {
      itemsByName.set(item.name, item);
      if (item.isMagic) magicItems.push(item);
    }

    const lootRoller = new LootRoller({
      selectTemplate: createMonsterLootTemplateSelector(
        templates.map(t => ({
          key: t.profession,
          crBucket: t.crBucket,
          coinage: t.coinage as LootTemplate['coinage'],
          items: t.items as unknown as LootTemplate['items'],
        }))
      ),
      trinkets,
      itemsByName,
      magicItems,
      gameRules: resolveLootGameRules(gameRules),
      templateItemSource: 'monster',
    });

    return {
      rollForMonster: (monster, rng) => {
        const { selectionKey, crBucket } = monsterToLootSelection(monster);
        return lootRoller.rollLoot({ selectionKey, crBucket, rng });
      },
    };
  }
}
