import type { AttunedItem } from '@/lib/types';

/**
 * Pure helpers for the sheet's attunement management (VEG-403). A character may
 * attune up to three magic items (2024 rules); the cap is enforced here and at
 * the DTO boundary (`@ArrayMaxSize(3)`). Mirrors the inventory transforms in
 * `character-inventory.ts`.
 */

/** Maximum attuned items (2024 limit). */
export const ATTUNEMENT_MAX = 3;

/**
 * Append an attuned item, returning a new array — unless the 3-slot cap is
 * already reached, in which case the original list is returned unchanged.
 */
export function addAttunedItem(items: AttunedItem[], item: AttunedItem): AttunedItem[] {
  if (items.length >= ATTUNEMENT_MAX) return items;
  return [...items, item];
}

/** Remove the item at `index`; an out-of-range index is a no-op (new array). */
export function removeAttunedItemAt(items: AttunedItem[], index: number): AttunedItem[] {
  return items.filter((_, i) => i !== index);
}
