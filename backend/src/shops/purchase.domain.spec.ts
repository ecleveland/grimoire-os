import type { Currency, InventoryItem, ShopLineItem } from '@grimoire-os/shared';
import { toCopper } from '@grimoire-os/shared';
import {
  applyStockDecrement,
  lineTotal,
  mergeInventory,
  priceAndSettle,
  resolvePurchasableLine,
} from './purchase.domain';

const gp = (n: number): Currency => ({ cp: 0, sp: 0, ep: 0, gp: n, pp: 0 });

const line = (over: Partial<ShopLineItem> = {}): ShopLineItem => ({
  itemId: null,
  name: 'Potion of Healing',
  category: 'Potion',
  price: gp(50),
  stock: 5,
  ...over,
});

describe('purchase.domain', () => {
  describe('lineTotal', () => {
    it('multiplies the unit price by quantity (copper-exact)', () => {
      expect(toCopper(lineTotal(gp(50), 3))).toBe(15_000);
    });

    it('equals the unit price for quantity 1', () => {
      expect(toCopper(lineTotal(gp(50), 1))).toBe(5_000);
    });

    it('is zero for an all-zero (free) price', () => {
      expect(toCopper(lineTotal({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, 4))).toBe(0);
    });
  });

  describe('priceAndSettle', () => {
    it('returns the total and change-made new balance when affordable', () => {
      const res = priceAndSettle(gp(100), gp(30), 1);
      expect(res).not.toBeNull();
      expect(toCopper(res!.total)).toBe(3_000);
      expect(toCopper(res!.newBalance)).toBe(7_000);
    });

    it('scales the total by quantity', () => {
      const res = priceAndSettle(gp(100), gp(30), 3);
      expect(res).not.toBeNull();
      expect(toCopper(res!.total)).toBe(9_000);
      expect(toCopper(res!.newBalance)).toBe(1_000);
    });

    it('leaves a zero balance when funds are exact', () => {
      const res = priceAndSettle(gp(90), gp(30), 3);
      expect(toCopper(res!.newBalance)).toBe(0);
    });

    it('returns null when the balance cannot cover the price', () => {
      expect(priceAndSettle(gp(10), gp(30), 1)).toBeNull();
    });

    it('treats a null balance as an empty purse', () => {
      expect(priceAndSettle(null, gp(1), 1)).toBeNull();
    });

    it('allows a free item against a null balance', () => {
      const res = priceAndSettle(null, gp(0), 2);
      expect(res).not.toBeNull();
      expect(toCopper(res!.newBalance)).toBe(0);
    });
  });

  describe('mergeInventory', () => {
    const owned = (over: Partial<InventoryItem> = {}): InventoryItem => ({
      name: 'Potion of Healing',
      quantity: 2,
      equipped: false,
      ...over,
    });

    it('appends to an empty/null inventory', () => {
      const result = mergeInventory(null, { name: 'Torch', quantity: 3 });
      expect(result).toEqual([{ name: 'Torch', quantity: 3, equipped: false }]);
    });

    it('merges by itemId, summing quantity and preserving the existing entry', () => {
      const inv = [owned({ itemId: 'cat-1', quantity: 2, equipped: true })];
      const result = mergeInventory(inv, {
        name: 'Potion of Healing',
        itemId: 'cat-1',
        quantity: 3,
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ itemId: 'cat-1', quantity: 5, equipped: true });
    });

    it('appends when the itemId differs', () => {
      const inv = [owned({ itemId: 'cat-1' })];
      const result = mergeInventory(inv, { name: 'Antitoxin', itemId: 'cat-2', quantity: 1 });
      expect(result).toHaveLength(2);
    });

    it('never merges by name when itemId is absent (distinct free-typed items)', () => {
      const inv = [owned({ name: 'Torch', itemId: undefined })];
      const result = mergeInventory(inv, { name: 'Torch', quantity: 1 });
      expect(result).toHaveLength(2);
    });

    it('appends rather than merging a catalog item onto a same-named free-typed entry', () => {
      const inv = [owned({ name: 'Torch', itemId: undefined })];
      const result = mergeInventory(inv, { name: 'Torch', itemId: 'cat-9', quantity: 1 });
      expect(result).toHaveLength(2);
      expect(result[1]).toMatchObject({ itemId: 'cat-9', quantity: 1, equipped: false });
    });

    it('does not mutate the input array', () => {
      const inv = [owned({ itemId: 'cat-1' })];
      const snapshot = JSON.parse(JSON.stringify(inv));
      mergeInventory(inv, { name: 'Potion of Healing', itemId: 'cat-1', quantity: 3 });
      expect(inv).toEqual(snapshot);
    });
  });

  describe('applyStockDecrement', () => {
    it('decrements finite stock at the target index', () => {
      const items = [line({ stock: 5 }), line({ name: 'Torch', stock: 9 })];
      const result = applyStockDecrement(items, 0, 2);
      expect(result[0].stock).toBe(3);
      expect(result[1].stock).toBe(9);
    });

    it('leaves unlimited (null) stock untouched', () => {
      const result = applyStockDecrement([line({ stock: null })], 0, 3);
      expect(result[0].stock).toBeNull();
    });

    it('does not mutate the input array', () => {
      const items = [line({ stock: 5 })];
      applyStockDecrement(items, 0, 2);
      expect(items[0].stock).toBe(5);
    });
  });

  describe('resolvePurchasableLine', () => {
    const items = [line({ stock: 5 }), line({ name: 'Torch', stock: null })];

    it('resolves a valid index with enough stock', () => {
      expect(resolvePurchasableLine(items, 0, 5)).toEqual({ ok: true, line: items[0] });
    });

    it('allows any quantity against unlimited stock', () => {
      expect(resolvePurchasableLine(items, 1, 999)).toEqual({ ok: true, line: items[1] });
    });

    it('reports not-found for an out-of-range index', () => {
      expect(resolvePurchasableLine(items, 7, 1)).toEqual({ ok: false, reason: 'not-found' });
    });

    it('reports not-found for a negative index', () => {
      expect(resolvePurchasableLine(items, -1, 1)).toEqual({ ok: false, reason: 'not-found' });
    });

    it('reports out-of-stock when quantity exceeds finite stock', () => {
      expect(resolvePurchasableLine(items, 0, 6)).toEqual({ ok: false, reason: 'out-of-stock' });
    });

    it('reports out-of-stock for a sold-out (stock 0) line', () => {
      expect(resolvePurchasableLine([line({ stock: 0 })], 0, 1)).toEqual({
        ok: false,
        reason: 'out-of-stock',
      });
    });
  });
});
