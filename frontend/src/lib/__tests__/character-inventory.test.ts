import { describe, it, expect } from 'vitest';
import type { InventoryItem } from '@/lib/types';
import {
  addInventoryItem,
  removeInventoryItemAt,
  updateInventoryItemAt,
  stripCatalogLinkAt,
  toggleEquippedAt,
} from '../character-inventory';

const items: InventoryItem[] = [
  { name: 'Chain Mail', quantity: 1, weight: 55, equipped: true },
  { name: 'Handaxe', quantity: 2, weight: 2, equipped: false },
  { name: 'Rope (50ft)', quantity: 1, equipped: false }, // no weight
];

describe('addInventoryItem', () => {
  it('appends an item without mutating the original list', () => {
    const next = addInventoryItem(items, { name: 'Torch', quantity: 1, equipped: false });
    expect(next).toHaveLength(4);
    expect(next[3].name).toBe('Torch');
    expect(items).toHaveLength(3);
  });
});

describe('removeInventoryItemAt', () => {
  it('removes the item at the given index', () => {
    const next = removeInventoryItemAt(items, 1);
    expect(next).toHaveLength(2);
    expect(next.map(i => i.name)).toEqual(['Chain Mail', 'Rope (50ft)']);
  });

  it('returns an equivalent list for an out-of-range index', () => {
    expect(removeInventoryItemAt(items, 9)).toHaveLength(3);
  });
});

describe('updateInventoryItemAt', () => {
  it('merges the patch into the item at the index', () => {
    const next = updateInventoryItemAt(items, 1, { quantity: 5, weight: 3 });
    expect(next[1]).toMatchObject({ name: 'Handaxe', quantity: 5, weight: 3 });
    expect(items[1].quantity).toBe(2); // original untouched
  });

  it('leaves other items unchanged', () => {
    const next = updateInventoryItemAt(items, 1, { quantity: 5 });
    expect(next[0]).toEqual(items[0]);
    expect(next[2]).toEqual(items[2]);
  });
});

describe('stripCatalogLinkAt', () => {
  const linked: InventoryItem[] = [
    {
      name: 'Chain Mail',
      quantity: 1,
      equipped: true,
      itemId: 'item-1',
      gear: { type: 'armor', armorType: 'heavy', baseArmorClass: 16 },
    },
    { name: 'Rope', quantity: 1, equipped: false },
  ];

  it('removes itemId and gear from the item at the index', () => {
    const next = stripCatalogLinkAt(linked, 0);
    expect(next[0]).toEqual({ name: 'Chain Mail', quantity: 1, equipped: true });
    expect(next[0]).not.toHaveProperty('itemId');
    expect(next[0]).not.toHaveProperty('gear');
    // Original untouched, other items unchanged.
    expect(linked[0].gear).toBeDefined();
    expect(next[1]).toEqual(linked[1]);
  });

  it('is a no-op (new array) for an unlinked item or out-of-range index', () => {
    expect(stripCatalogLinkAt(linked, 1)[1]).toEqual(linked[1]);
    expect(stripCatalogLinkAt(linked, 9)).toHaveLength(2);
  });
});

describe('toggleEquippedAt', () => {
  it('flips the equipped flag at the index', () => {
    expect(toggleEquippedAt(items, 0)[0].equipped).toBe(false);
    expect(toggleEquippedAt(items, 1)[1].equipped).toBe(true);
  });
});
