import type { InventoryItem } from '@/lib/types';

/**
 * Pure helpers for the sheet's inventory CRUD (VEG-402). The component mutates
 * only the stored `inventory` array through these transforms — keeping the
 * arithmetic and clamp rules in one tested place, mirroring `character-play.ts`.
 *
 * The carry-capacity and encumbrance derivations that used to live here moved to
 * `computeEncumbrance` in `@grimoire-os/shared` (VEG-490): they are rules data,
 * and a local copy meant the inventory panel and the stat bar could disagree
 * about one character's speed. The sheet now reads `computed.encumbrance`.
 */

/** Append an item, returning a new array (never mutates the input). */
export function addInventoryItem(inventory: InventoryItem[], item: InventoryItem): InventoryItem[] {
  return [...inventory, item];
}

/** Remove the item at `index`; an out-of-range index is a no-op (new array). */
export function removeInventoryItemAt(inventory: InventoryItem[], index: number): InventoryItem[] {
  return inventory.filter((_, i) => i !== index);
}

/** Merge `patch` into the item at `index`; other items are untouched. */
export function updateInventoryItemAt(
  inventory: InventoryItem[],
  index: number,
  patch: Partial<InventoryItem>
): InventoryItem[] {
  return inventory.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

/** Flip the `equipped` flag of the item at `index`. */
export function toggleEquippedAt(inventory: InventoryItem[], index: number): InventoryItem[] {
  return updateInventoryItemAt(inventory, index, { equipped: !inventory[index]?.equipped });
}

/**
 * Drop the catalog link and gear snapshot from the item at `index` (new
 * array). Renaming a row repurposes it, so keeping the invisible snapshot
 * would let a "Traveler's Clothes" row silently keep contributing Chain
 * Mail's AC (VEG-410) — mirrors the add form clearing both on a name edit.
 */
export function stripCatalogLinkAt(inventory: InventoryItem[], index: number): InventoryItem[] {
  return inventory.map((item, i) => {
    if (i !== index) return item;
    const { itemId: _itemId, gear: _gear, ...rest } = item;
    return rest;
  });
}
