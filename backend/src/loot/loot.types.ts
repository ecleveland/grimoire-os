// Shared loot-roll types (VEG-297). Neutral home for the shapes the loot
// engine consumes and produces so both the NPC generator and the encounter /
// monster loot features can use the same engine without depending on each
// other. The NPC generator re-exports these under its historical names.

import type { NpcLootItem, NpcLootOverrides } from '@grimoire-os/shared';

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

export type LootTemplateItem = { itemName: string; weight: number; qty: [number, number] };

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
