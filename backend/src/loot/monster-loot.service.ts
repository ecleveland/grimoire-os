// Injectable wiring for monster loot rolls (VEG-300): loads the monster-
// category templates plus the shared catalog data and exposes a roller that
// maps a monster's type × CR onto the pure loot engine (VEG-297/VEG-298).

import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SeededRng } from '../common/helpers/seeded-rng';
import { LootRoller } from './loot-roller';
import { createMonsterLootTemplateSelector, monsterToLootSelection } from './monster-loot';
import { LOOT_GAME_RULE_CATEGORY, resolveLootGameRules } from './loot-game-rules';
import { buildItemCatalogMaps } from './item-catalog';
import { GeneratedLoot, LOOT_CR_BUCKETS, LootTemplate } from './loot.types';

export type MonsterLootInput = { type: string; challengeRating: number };

/** A roller bound to a loaded data snapshot; cheap to call per combatant. */
export interface MonsterLootRoller {
  rollForMonster(monster: MonsterLootInput, rng: SeededRng): GeneratedLoot;
}

/**
 * Orders templates poorest-bucket-first (the canonical LOOT_CR_BUCKETS order,
 * unknown buckets last) so the selector's any-bucket fallback degrades a
 * monster missing its derived bucket to the poorest tier for its type. A DB
 * `orderBy crBucket asc` cannot do this: the buckets sort lexicographically
 * ('11+' lands before '2–4'), which would hand low-CR monsters the richest
 * hoard. Sort is stable, so equal-bucket rows keep their fetch order.
 */
function sortByBucketRank(templates: LootTemplate[]): LootTemplate[] {
  const rank = (bucket: string) => {
    const index = (LOOT_CR_BUCKETS as readonly string[]).indexOf(bucket);
    return index === -1 ? LOOT_CR_BUCKETS.length : index;
  };
  return templates.sort((a, b) => rank(a.crBucket) - rank(b.crBucket));
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
      // `orderBy id` only pins a deterministic fetch order (Postgres row
      // order without ORDER BY is unspecified); the bucket ordering the
      // selector's fallback relies on is imposed in JS below.
      this.prisma.npcLootTemplate.findMany({
        where: { isActive: true, category: 'monster' },
        orderBy: { id: 'asc' },
      }),
      this.prisma.trinket.findMany({ where: { isActive: true }, select: { description: true } }),
      this.prisma.item.findMany({ select: { id: true, name: true, isMagic: true } }),
      this.prisma.gameRule.findMany({ where: { category: LOOT_GAME_RULE_CATEGORY } }),
    ]);

    // Zero templates means the database was never seeded — fail loudly
    // rather than persist silent zero-loot drops onto every combatant.
    if (templates.length === 0) {
      throw new UnprocessableEntityException(
        'No active monster loot templates found — run the backend seed (npm run seed).'
      );
    }

    const { itemsByName, magicItems } = buildItemCatalogMaps(items);

    const lootRoller = new LootRoller({
      selectTemplate: createMonsterLootTemplateSelector(
        sortByBucketRank(
          templates.map(t => ({
            key: t.profession,
            crBucket: t.crBucket,
            coinage: t.coinage as LootTemplate['coinage'],
            items: t.items as unknown as LootTemplate['items'],
          }))
        )
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
