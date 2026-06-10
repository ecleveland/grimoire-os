// Loot tuning knobs resolved from GameRule rows (VEG-300, extracted from
// NpcRefDataLoader). One category governs the whole loot engine: the NPC
// generator and monster/encounter loot read the same rows, so an admin tunes
// drop rates in one place.

import { LootGameRules } from './loot.types';

/**
 * The GameRule category holding the loot knobs. Historically named for the
 * NPC generator (the rows predate the shared engine); kept because rows may
 * already exist under it in deployed databases.
 */
export const LOOT_GAME_RULE_CATEGORY = 'npc-generation';

export const DEFAULT_LOOT_GAME_RULES: LootGameRules = {
  trinketChance: 0.05,
  magicItemChanceByCr: {
    '0': 0.001,
    '0–1': 0.005,
    '2–4': 0.02,
    '5–10': 0.05,
    '11+': 0.15,
  },
  itemCountDie: '1d3',
  coinageMultiplier: 1,
};

/**
 * Resolves the effective loot game rules from raw GameRule rows, falling back
 * to {@link DEFAULT_LOOT_GAME_RULES} per key when a row is absent.
 */
export function resolveLootGameRules(
  rows: readonly { key: string; value: unknown }[]
): LootGameRules {
  const byKey = new Map<string, unknown>();
  for (const row of rows) byKey.set(row.key, row.value);

  return {
    trinketChance:
      (byKey.get('trinket-chance') as number | undefined) ?? DEFAULT_LOOT_GAME_RULES.trinketChance,
    magicItemChanceByCr:
      (byKey.get('magic-item-chance-by-cr') as Record<string, number> | undefined) ??
      DEFAULT_LOOT_GAME_RULES.magicItemChanceByCr,
    itemCountDie:
      (byKey.get('item-count-die') as string | undefined) ?? DEFAULT_LOOT_GAME_RULES.itemCountDie,
    coinageMultiplier:
      (byKey.get('coinage-multiplier') as number | undefined) ??
      DEFAULT_LOOT_GAME_RULES.coinageMultiplier,
  };
}
