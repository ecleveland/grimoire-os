import { describe, it, expect } from 'vitest';
import type { InventoryItem } from '@/lib/types';
import {
  totalInventoryWeight,
  carryingCapacity,
  sizeCarryMultiplier,
  encumbranceStatus,
  addInventoryItem,
  removeInventoryItemAt,
  updateInventoryItemAt,
  toggleEquippedAt,
} from '../character-inventory';

const items: InventoryItem[] = [
  { name: 'Chain Mail', quantity: 1, weight: 55, equipped: true },
  { name: 'Handaxe', quantity: 2, weight: 2, equipped: false },
  { name: 'Rope (50ft)', quantity: 1, equipped: false }, // no weight
];

describe('totalInventoryWeight', () => {
  it('sums weight × quantity across items', () => {
    // 55*1 + 2*2 + 0*1 = 59
    expect(totalInventoryWeight(items)).toBe(59);
  });

  it('treats a missing weight as 0', () => {
    expect(totalInventoryWeight([{ name: 'Torch', quantity: 3, equipped: false }])).toBe(0);
  });

  it('returns 0 for an empty inventory', () => {
    expect(totalInventoryWeight([])).toBe(0);
  });

  it('rounds fractional totals to two decimals', () => {
    const frac: InventoryItem[] = [{ name: 'Caltrops', quantity: 3, weight: 0.1, equipped: false }];
    expect(totalInventoryWeight(frac)).toBe(0.3);
  });
});

describe('carryingCapacity', () => {
  it('is Strength score × 15 for a Medium creature', () => {
    expect(carryingCapacity(16)).toBe(240);
    expect(carryingCapacity(16, 'Medium')).toBe(240);
  });

  it('applies the size multiplier (Large doubles, Tiny halves)', () => {
    expect(carryingCapacity(16, 'Large')).toBe(480);
    expect(carryingCapacity(16, 'Tiny')).toBe(120);
    expect(carryingCapacity(10, 'Gargantuan')).toBe(1200);
  });

  it('falls back to the Medium multiplier for an unknown size', () => {
    expect(carryingCapacity(12, 'Weird')).toBe(180);
  });
});

describe('sizeCarryMultiplier', () => {
  it('returns the size multiplier (Medium ×1, Large ×2, Tiny ×0.5)', () => {
    expect(sizeCarryMultiplier('Medium')).toBe(1);
    expect(sizeCarryMultiplier('Large')).toBe(2);
    expect(sizeCarryMultiplier('Tiny')).toBe(0.5);
  });

  it('falls back to ×1 for an absent or unknown size', () => {
    expect(sizeCarryMultiplier()).toBe(1);
    expect(sizeCarryMultiplier('Weird')).toBe(1);
  });
});

describe('encumbranceStatus', () => {
  // STR 10, Medium: encumbered > 50, heavily encumbered > 100.
  it('is unencumbered at or below Strength × 5', () => {
    const s = encumbranceStatus(10, 'Medium', 50);
    expect(s.tier).toBe('unencumbered');
    expect(s.speedPenalty).toBe(0);
    expect(s.hasDisadvantage).toBe(false);
  });

  it('is encumbered above Strength × 5 (−10 ft, no disadvantage)', () => {
    const s = encumbranceStatus(10, 'Medium', 51);
    expect(s.tier).toBe('encumbered');
    expect(s.speedPenalty).toBe(10);
    expect(s.hasDisadvantage).toBe(false);
  });

  it('stays encumbered up to and including Strength × 10', () => {
    expect(encumbranceStatus(10, 'Medium', 100).tier).toBe('encumbered');
  });

  it('is heavily encumbered above Strength × 10 (−20 ft + disadvantage)', () => {
    const s = encumbranceStatus(10, 'Medium', 101);
    expect(s.tier).toBe('heavily-encumbered');
    expect(s.speedPenalty).toBe(20);
    expect(s.hasDisadvantage).toBe(true);
  });

  it('scales the thresholds by creature size', () => {
    // STR 10, Large (×2): encumbered > 100, heavily > 200.
    expect(encumbranceStatus(10, 'Large', 100).tier).toBe('unencumbered');
    expect(encumbranceStatus(10, 'Large', 101).tier).toBe('encumbered');
    expect(encumbranceStatus(10, 'Large', 200).tier).toBe('encumbered');
    expect(encumbranceStatus(10, 'Large', 201).tier).toBe('heavily-encumbered');
  });

  it('defaults to the Medium multiplier for an absent size', () => {
    expect(encumbranceStatus(10, undefined, 51).tier).toBe('encumbered');
  });
});

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

describe('toggleEquippedAt', () => {
  it('flips the equipped flag at the index', () => {
    expect(toggleEquippedAt(items, 0)[0].equipped).toBe(false);
    expect(toggleEquippedAt(items, 1)[1].equipped).toBe(true);
  });
});
