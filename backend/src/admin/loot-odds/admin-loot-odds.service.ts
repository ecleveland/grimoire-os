import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LOOT_GAME_RULE_CATEGORY, resolveLootGameRules } from '../../loot/loot-game-rules';
import { LootGameRules } from '../../loot/loot.types';
import { UpdateLootOddsDto } from './dto/update-loot-odds.dto';

// Maps the camelCase knobs the API speaks to the kebab-case GameRule keys the
// seed and loot engine use (see seed/data/game-rules.ts, resolveLootGameRules).
// Keeping it explicit avoids a brittle string transform and documents the
// exact rows this editor owns.
const KEY_BY_KNOB: Record<keyof UpdateLootOddsDto, string> = {
  trinketChance: 'trinket-chance',
  magicItemChanceByCr: 'magic-item-chance-by-cr',
  itemCountDie: 'item-count-die',
  coinageMultiplier: 'coinage-multiplier',
};

@Injectable()
export class AdminLootOddsService {
  constructor(private readonly prisma: PrismaService) {}

  // The effective global loot knobs: stored rows resolved (with defaults
  // filled for any absent/malformed row) exactly as the loot engine sees them.
  async get(): Promise<LootGameRules> {
    const rows = await this.prisma.gameRule.findMany({
      where: { category: LOOT_GAME_RULE_CATEGORY },
    });
    return resolveLootGameRules(rows);
  }

  // Upserts only the knobs present in the payload. A row may already exist (a
  // seeded environment) or not (never seeded), so upsert handles both. No cache
  // to bust: the NPC generator and monster/encounter loot reload these rows per
  // request.
  async update(dto: UpdateLootOddsDto): Promise<LootGameRules> {
    const writes: Prisma.PrismaPromise<unknown>[] = [];
    for (const knob of Object.keys(KEY_BY_KNOB) as (keyof UpdateLootOddsDto)[]) {
      const value = dto[knob];
      if (value === undefined) continue;
      const key = KEY_BY_KNOB[knob];
      writes.push(
        this.prisma.gameRule.upsert({
          where: { category_key: { category: LOOT_GAME_RULE_CATEGORY, key } },
          create: { category: LOOT_GAME_RULE_CATEGORY, key, value: value as Prisma.InputJsonValue },
          update: { value: value as Prisma.InputJsonValue },
        })
      );
    }
    if (writes.length > 0) await this.prisma.$transaction(writes);
    return this.get();
  }
}
