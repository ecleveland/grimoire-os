import { describe, it, expect } from 'vitest';
import type { AttunedItem } from '@/lib/types';
import { ATTUNEMENT_MAX, addAttunedItem, removeAttunedItemAt } from '../character-attunement';

const items: AttunedItem[] = [
  { name: 'Cloak of Protection' },
  { name: 'Ring of Evasion', itemId: '123e4567-e89b-42d3-a456-426614174000' },
];

describe('ATTUNEMENT_MAX', () => {
  it('is 3 (the 2024 limit)', () => {
    expect(ATTUNEMENT_MAX).toBe(3);
  });
});

describe('addAttunedItem', () => {
  it('appends an item without mutating the original list', () => {
    const next = addAttunedItem(items, { name: 'Amulet of Health' });
    expect(next).toHaveLength(3);
    expect(next[2].name).toBe('Amulet of Health');
    expect(items).toHaveLength(2);
  });

  it('does not exceed the 3-slot cap (returns the list unchanged when full)', () => {
    const full: AttunedItem[] = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    const next = addAttunedItem(full, { name: 'D' });
    expect(next).toBe(full);
    expect(next).toHaveLength(3);
  });
});

describe('removeAttunedItemAt', () => {
  it('removes the item at the given index', () => {
    const next = removeAttunedItemAt(items, 0);
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe('Ring of Evasion');
  });

  it('returns an equivalent list for an out-of-range index', () => {
    expect(removeAttunedItemAt(items, 9)).toHaveLength(2);
  });
});
