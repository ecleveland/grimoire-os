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
 * Resolve the size carry multiplier. `size` is free-text server-side, so guard
 * membership before indexing the size-keyed map; an unknown/absent size falls
 * back to the Medium (×1) multiplier.
 */
export function sizeCarryMultiplier(size?: string): number {
  return size && size in SIZE_CARRY_MULTIPLIERS ? SIZE_CARRY_MULTIPLIERS[size as Size] : 1;
}

/**
 * Carrying capacity in pounds: Strength × 15, scaled by the creature's size
 * (5e). An unknown/absent size falls back to the Medium (×1) multiplier.
 */
export function carryingCapacity(strength: number, size?: string): number {
  return strength * 15 * sizeCarryMultiplier(size);
}

/** 5e variant encumbrance tiers, lightest to heaviest. */
export type EncumbranceTier = 'unencumbered' | 'encumbered' | 'heavily-encumbered';

export interface EncumbranceStatus {
  tier: EncumbranceTier;
  /** Speed reduction in feet for this tier (0, 10, or 20). */
  speedPenalty: number;
  /** Heavily encumbered also imposes disadvantage on checks/attacks/STR-DEX-CON saves. */
  hasDisadvantage: boolean;
}

/** Per-tier movement penalty + disadvantage — the single source of truth. */
const ENCUMBRANCE_TIER_EFFECT: Record<EncumbranceTier, Omit<EncumbranceStatus, 'tier'>> = {
  unencumbered: { speedPenalty: 0, hasDisadvantage: false },
  encumbered: { speedPenalty: 10, hasDisadvantage: false },
  'heavily-encumbered': { speedPenalty: 20, hasDisadvantage: true },
};

/**
 * Classify carried weight into 5e's variant encumbrance tiers (the seeded
 * `carrying-capacity` game rule): encumbered above Strength × 5 (−10 ft) and
 * heavily encumbered above Strength × 10 (−20 ft + disadvantage). Thresholds are
 * size-scaled by the same multiplier as `carryingCapacity` (Strength × 15).
 */
export function encumbranceStatus(
  strength: number,
  size: string | undefined,
  carried: number
): EncumbranceStatus {
  const multiplier = sizeCarryMultiplier(size);
  const tier: EncumbranceTier =
    carried > strength * 10 * multiplier
      ? 'heavily-encumbered'
      : carried > strength * 5 * multiplier
        ? 'encumbered'
        : 'unencumbered';
  return { tier, ...ENCUMBRANCE_TIER_EFFECT[tier] };
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
