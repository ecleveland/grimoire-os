// Item-catalog indexes the loot engine consumes, built in one place so the
// NPC generator and monster loot can't drift on what counts as a magic item
// or how template item names resolve to catalog rows.

import { LootItemRef } from './loot.types';

export type ItemCatalogMaps = {
  itemsByName: Map<string, LootItemRef>;
  magicItems: LootItemRef[];
};

export function buildItemCatalogMaps(items: readonly LootItemRef[]): ItemCatalogMaps {
  const itemsByName = new Map<string, LootItemRef>();
  const magicItems: LootItemRef[] = [];
  for (const item of items) {
    itemsByName.set(item.name, item);
    if (item.isMagic) magicItems.push(item);
  }
  return { itemsByName, magicItems };
}
