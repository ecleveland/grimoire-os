// Loot tuning knobs resolved from GameRule rows (VEG-300, extracted from
// NpcRefDataLoader). One category governs the whole loot engine: the NPC
// generator and monster/encounter loot read the same rows, so an admin tunes
// drop rates in one place.

import { LootGameRules } from './loot.types';

/**
 * The GameRule category holding the loot knobs. Historically named for the
 * NPC generator (the rows predate the shared engine); the seed writes the
 * four loot rows under it (see seed/data/game-rules.ts), so renaming the
 * category means migrating those rows in lockstep.
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

// Negative values are misconfigurations, not tunings: a negative multiplier
// would persist negative coinage onto combatants, which the combatant DTO
// then rejects (@Min(0)) on the client's next encounter PATCH.
const asNonNegativeNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asChanceMap = (value: unknown): Record<string, number> | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const entries = Object.values(value);
  // {} is treated as absent — disabling drops is expressed with explicit
  // zero values, not an empty map.
  return entries.length > 0 && entries.every(v => asNonNegativeNumber(v) !== undefined)
    ? (value as Record<string, number>)
    : undefined;
};

/**
 * Resolves the effective loot game rules from raw GameRule rows, falling back
 * to {@link DEFAULT_LOOT_GAME_RULES} per key when a row is absent OR its Json
 * value has the wrong shape. Malformed values must never flow through: a
 * numeric die spec crashes the die parser with an opaque 500, a non-numeric
 * multiplier turns coinage into NaN, and NaN chances silently disable drops.
 */
export function resolveLootGameRules(
  rows: readonly { key: string; value: unknown }[]
): LootGameRules {
  const byKey = new Map<string, unknown>();
  for (const row of rows) byKey.set(row.key, row.value);

  return {
    trinketChance:
      asNonNegativeNumber(byKey.get('trinket-chance')) ?? DEFAULT_LOOT_GAME_RULES.trinketChance,
    magicItemChanceByCr:
      asChanceMap(byKey.get('magic-item-chance-by-cr')) ??
      DEFAULT_LOOT_GAME_RULES.magicItemChanceByCr,
    itemCountDie: asString(byKey.get('item-count-die')) ?? DEFAULT_LOOT_GAME_RULES.itemCountDie,
    coinageMultiplier:
      asNonNegativeNumber(byKey.get('coinage-multiplier')) ??
      DEFAULT_LOOT_GAME_RULES.coinageMultiplier,
  };
}
