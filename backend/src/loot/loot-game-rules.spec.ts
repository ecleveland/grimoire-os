import { DEFAULT_LOOT_GAME_RULES, resolveLootGameRules } from './loot-game-rules';

describe('resolveLootGameRules', () => {
  it('applies seeded overrides for all four keys', () => {
    const rules = resolveLootGameRules([
      { key: 'trinket-chance', value: 0.5 },
      { key: 'magic-item-chance-by-cr', value: { '0': 0.1, '11+': 0.9 } },
      { key: 'item-count-die', value: '2d6' },
      { key: 'coinage-multiplier', value: 3 },
    ]);
    expect(rules).toEqual({
      trinketChance: 0.5,
      magicItemChanceByCr: { '0': 0.1, '11+': 0.9 },
      itemCountDie: '2d6',
      coinageMultiplier: 3,
    });
  });

  it('falls back to defaults when rows are absent', () => {
    expect(resolveLootGameRules([])).toEqual(DEFAULT_LOOT_GAME_RULES);
  });

  it('falls back per key when only some rows exist', () => {
    const rules = resolveLootGameRules([{ key: 'coinage-multiplier', value: 2 }]);
    expect(rules.coinageMultiplier).toBe(2);
    expect(rules.trinketChance).toBe(DEFAULT_LOOT_GAME_RULES.trinketChance);
    expect(rules.itemCountDie).toBe(DEFAULT_LOOT_GAME_RULES.itemCountDie);
  });

  // Malformed rows must never flow through as-is: a numeric die spec would
  // crash SeededRng.rollDie with an opaque 500, a non-numeric multiplier
  // turns coinage into NaN, and NaN chances silently disable drops forever.
  it('falls back to the default when a value has the wrong type', () => {
    const rules = resolveLootGameRules([
      { key: 'trinket-chance', value: 'high' },
      { key: 'magic-item-chance-by-cr', value: [0.1, 0.2] },
      { key: 'item-count-die', value: 3 },
      { key: 'coinage-multiplier', value: 'x2' },
    ]);
    expect(rules).toEqual(DEFAULT_LOOT_GAME_RULES);
  });

  it('rejects a chance map containing non-numeric values', () => {
    const rules = resolveLootGameRules([
      { key: 'magic-item-chance-by-cr', value: { '0': 0.1, '11+': 'lots' } },
    ]);
    expect(rules.magicItemChanceByCr).toEqual(DEFAULT_LOOT_GAME_RULES.magicItemChanceByCr);
  });

  it('treats JSON null values as absent', () => {
    const rules = resolveLootGameRules([{ key: 'trinket-chance', value: null }]);
    expect(rules.trinketChance).toBe(DEFAULT_LOOT_GAME_RULES.trinketChance);
  });
});
