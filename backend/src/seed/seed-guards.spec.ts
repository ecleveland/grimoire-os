import { assertUniqueSeedNames } from './seed-guards';

// Pre-seed dedup guard (VEG-308): every seed dataset that upserts by name runs
// through this before touching the database, so a duplicate name — within one
// source file or across files feeding the same table — fails loudly instead of
// silently last-write-wins clobbering a row.
describe('assertUniqueSeedNames', () => {
  it('passes when every name is unique across all sources', () => {
    expect(() =>
      assertUniqueSeedNames('item', {
        'equipment.json': ['Longsword', 'Backpack'],
        'magic_items.json': ['Bag of Holding'],
      })
    ).not.toThrow();
  });

  it('fails loudly on a duplicate within a single source', () => {
    expect(() =>
      assertUniqueSeedNames('item', {
        'equipment.json': ['Longsword', 'Longsword'],
      })
    ).toThrow(/duplicate item name[\s\S]*"Longsword"[\s\S]*equipment\.json/);
  });

  it('fails loudly on a collision across sources, naming both files', () => {
    expect(() =>
      assertUniqueSeedNames('item', {
        'equipment.json': ['Potion of Healing'],
        'magic_items.json': ['Potion of Healing'],
      })
    ).toThrow(/"Potion of Healing"[\s\S]*equipment\.json[\s\S]*magic_items\.json/);
  });

  it('reports every duplicate, not just the first', () => {
    expect(() =>
      assertUniqueSeedNames('item', {
        a: ['X', 'Y'],
        b: ['X', 'Y'],
      })
    ).toThrow(/"X"[\s\S]*"Y"/);
  });
});
