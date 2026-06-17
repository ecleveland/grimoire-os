import type { InventoryItem, Size } from '@/lib/types';

/**
 * Pure helpers for the sheet's inventory CRUD (VEG-402). The component mutates
 * only the stored `inventory` array through these transforms and renders the
 * carrying-capacity readout from the weight/capacity helpers — keeping the
 * arithmetic and clamp rules in one tested place, mirroring `character-play.ts`.
 */

/**
 * Carry-capacity size multipliers, mirroring the seeded `carrying-capacity`
 * game rule (`backend/src/seed/data/game-rules.ts`). A creature's capacity is
 * Strength × 15 × this multiplier.
 */
export const SIZE_CARRY_MULTIPLIERS: Record<Size, number> = {
  Tiny: 0.5,
  Small: 1,
  Medium: 1,
  Large: 2,
  Huge: 4,
  Gargantuan: 8,
};

/** Round to two decimals so fractional weights don't show float drift. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Total weight carried: Σ (weight × quantity); a missing weight counts as 0. */
export function totalInventoryWeight(inventory: InventoryItem[]): number {
  return round2(inventory.reduce((sum, item) => sum + (item.weight ?? 0) * item.quantity, 0));
}

/**
 * Carrying capacity in pounds: Strength × 15, scaled by the creature's size
 * (5e). An unknown/absent size falls back to the Medium (×1) multiplier.
 */
export function carryingCapacity(strength: number, size?: string): number {
  // `size` is free-text server-side, so guard membership before indexing the
  // size-keyed map; an unknown/absent size falls back to Medium (×1).
  const multiplier =
    size && size in SIZE_CARRY_MULTIPLIERS ? SIZE_CARRY_MULTIPLIERS[size as Size] : 1;
  return strength * 15 * multiplier;
}

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
