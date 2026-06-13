// Single definition of "a valid, non-empty loot-override set". Both the
// pipeline (persisting the lootOverrides column) and the reroll merge path
// (building effective constraints) must agree on which knobs exist, so the
// per-key whitelist lives here rather than in either caller.

import type { LootOverrides } from './loot.types';

export function normalizeLootOverrides(o: LootOverrides | null | undefined): LootOverrides | null {
  if (!o) return null;
  const cleaned: LootOverrides = {};
  if (o.trinketChance !== undefined) cleaned.trinketChance = o.trinketChance;
  if (o.magicItemChance !== undefined) cleaned.magicItemChance = o.magicItemChance;
  if (o.itemCountDie !== undefined) cleaned.itemCountDie = o.itemCountDie;
  if (o.coinageMultiplier !== undefined) cleaned.coinageMultiplier = o.coinageMultiplier;
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}
