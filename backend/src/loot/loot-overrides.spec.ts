import { normalizeLootOverrides } from './loot-overrides';

describe('normalizeLootOverrides', () => {
  it('returns null for null/undefined', () => {
    expect(normalizeLootOverrides(null)).toBeNull();
    expect(normalizeLootOverrides(undefined)).toBeNull();
  });

  it('returns null for an empty object', () => {
    expect(normalizeLootOverrides({})).toBeNull();
  });

  it('keeps the known knobs, including zero values', () => {
    expect(
      normalizeLootOverrides({
        coinageMultiplier: 0,
        trinketChance: 0,
        magicItemChance: 0.1,
        itemCountDie: '1d4',
      })
    ).toEqual({
      coinageMultiplier: 0,
      trinketChance: 0,
      magicItemChance: 0.1,
      itemCountDie: '1d4',
    });
  });

  it('drops unknown keys (the PATCH column is loosely typed)', () => {
    expect(
      normalizeLootOverrides({ coinageMultiplier: 2, junk: 99 } as Record<string, unknown>)
    ).toEqual({ coinageMultiplier: 2 });
  });

  it('collapses to null when only unknown keys are present', () => {
    expect(normalizeLootOverrides({ junk: 99 } as Record<string, unknown>)).toBeNull();
  });
});
