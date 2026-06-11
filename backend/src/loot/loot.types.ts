// Shared loot-roll types (VEG-297). Neutral home for the shapes the loot
// engine consumes and produces so both the NPC generator and the encounter /
// monster loot features can use the same engine without depending on each
// other. The NPC generator re-exports these under its historical names.

import type {
  LootTemplateCoinage,
  LootTemplateItemEntry,
  NpcLootItem,
  NpcLootOverrides,
} from '@grimoire-os/shared';
import { LOOT_CR_BUCKETS as SHARED_LOOT_CR_BUCKETS } from '@grimoire-os/shared';

// The shared package owns these two shapes — they are the API contract the
// DTOs and frontend already consume. Aliased here under engine-neutral names
// so the loot module has no NPC-flavored vocabulary of its own.
export type LootOverrides = NpcLootOverrides;

export type GeneratedLootItem = NpcLootItem;

export type GeneratedLoot = {
  // `profession` holds the template selection key. The field name is
  // historical — it is persisted on Npc.generationParams, so it cannot be
  // renamed without a data migration.
  template: { profession: string; crBucket: string } | null;
  coinage: { gp: number; sp: number; cp: number };
  items: GeneratedLootItem[];
  effective: {
    itemCountDie: string;
    coinageMultiplier: number;
    trinketChance: number;
    magicItemChance: number;
  };
};

/**
 * The CR buckets every loot template family is keyed by. Note the en-dash
 * (U+2013) in the range labels — an ASCII hyphen never matches a template.
 * Owned by the shared package since VEG-303 so the admin editors offer the
 * same values; re-exported here under the engine's historical names.
 */
export const LOOT_CR_BUCKETS = SHARED_LOOT_CR_BUCKETS;

export type LootCrBucket = (typeof LOOT_CR_BUCKETS)[number];

export type LootCoinage = LootTemplateCoinage;

export type LootTemplateItem = LootTemplateItemEntry;

export type LootTemplate = {
  // Selection key: the NPC generator keys templates by profession; monster
  // loot keys them by creature type.
  key: string;
  crBucket: string;
  coinage: { gp: [number, number]; sp: [number, number]; cp: [number, number] };
  items: LootTemplateItem[];
};

export type LootTrinket = { description: string };

export type LootItemRef = { id: string; name: string; isMagic: boolean };

export type LootGameRules = {
  trinketChance: number;
  magicItemChanceByCr: Record<string, number>;
  itemCountDie: string;
  coinageMultiplier: number;
};
