import type { Currency, InventoryItem, ShopLineItem } from '@grimoire-os/shared';
import { fromCopper, settle, toCopper } from '@grimoire-os/shared';

/**
 * Pure domain rules for a shop purchase (VEG-357). No Prisma, no Nest — every
 * function is total and deterministic so the money/inventory/stock logic (the
 * part that must never be wrong) is unit-tested without mocks. The service layer
 * orchestrates I/O and maps these results to HTTP exceptions.
 */

const ZERO: Readonly<Currency> = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

/** Copper-exact total for `quantity` units of `unitPrice`. */
export function lineTotal(unitPrice: Currency, quantity: number): Currency {
  return fromCopper(toCopper(unitPrice) * quantity);
}

/**
 * Compute the line total and the change-made new balance, or `null` when the
 * (possibly null/empty) purse can't cover it. Delegates the coin math to the
 * shared `settle` so backend and frontend derive identical numbers.
 */
export function priceAndSettle(
  balance: Currency | null | undefined,
  unitPrice: Currency,
  quantity: number
): { total: Currency; newBalance: Currency } | null {
  const total = lineTotal(unitPrice, quantity);
  const newBalance = settle(balance ?? ZERO, total);
  if (newBalance === null) return null;
  return { total, newBalance };
}

/**
 * Add a bought item to `inventory`, merging into an existing line only when both
 * carry the same non-null `itemId` (catalog identity); otherwise append. Never
 * merges by `name` — two free-typed items that share a label are distinct, and a
 * catalog item is not the same as a same-named hand-entered one. Returns a new
 * array; never mutates the input.
 */
export function mergeInventory(
  inventory: InventoryItem[] | null | undefined,
  added: { name: string; itemId?: string | null; quantity: number }
): InventoryItem[] {
  const current = inventory ?? [];
  if (added.itemId) {
    const idx = current.findIndex(i => i.itemId === added.itemId);
    if (idx >= 0) {
      const next = [...current];
      next[idx] = { ...next[idx], quantity: next[idx].quantity + added.quantity };
      return next;
    }
  }
  const entry: InventoryItem = { name: added.name, quantity: added.quantity, equipped: false };
  if (added.itemId) entry.itemId = added.itemId;
  return [...current, entry];
}

/**
 * Decrement finite stock at `index` by `quantity`; unlimited (`null`) stock is
 * left untouched. Assumes the quantity was already validated by
 * `resolvePurchasableLine`. Returns a new array; never mutates the input.
 */
export function applyStockDecrement(
  items: ShopLineItem[],
  index: number,
  quantity: number
): ShopLineItem[] {
  return items.map((item, i) =>
    i === index && item.stock !== null ? { ...item, stock: item.stock - quantity } : item
  );
}

export type LineResolution =
  | { ok: true; line: ShopLineItem }
  | { ok: false; reason: 'not-found' | 'out-of-stock' };

/**
 * Locate a purchasable line by index and validate the requested quantity against
 * its stock. `null` stock is unlimited; a finite stock must cover the quantity.
 */
export function resolvePurchasableLine(
  items: ShopLineItem[],
  index: number,
  quantity: number
): LineResolution {
  const line = items[index];
  if (index < 0 || !line) return { ok: false, reason: 'not-found' };
  if (line.stock !== null && quantity > line.stock) return { ok: false, reason: 'out-of-stock' };
  return { ok: true, line };
}
