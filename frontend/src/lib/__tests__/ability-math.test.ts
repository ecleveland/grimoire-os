import { describe, it, expect } from 'vitest';
import { recommendedAbilityKeys } from '../ability-math';

describe('recommendedAbilityKeys', () => {
  it('maps a single primary ability name to its ability key', () => {
    expect(recommendedAbilityKeys(['Strength'])).toEqual(['strength']);
    expect(recommendedAbilityKeys(['Intelligence'])).toEqual(['intelligence']);
  });

  it('maps multiple primary abilities, returning keys in canonical order', () => {
    // Monk → Dexterity + Wisdom. Input order is reversed to prove the result is
    // canonically ordered (STR, DEX, CON, INT, WIS, CHA), not input-ordered.
    expect(recommendedAbilityKeys(['Wisdom', 'Dexterity'])).toEqual(['dexterity', 'wisdom']);
  });

  it('returns an empty array for undefined, empty, or unrecognized input', () => {
    expect(recommendedAbilityKeys(undefined)).toEqual([]);
    expect(recommendedAbilityKeys([])).toEqual([]);
    expect(recommendedAbilityKeys(['Luck', 'Sanity'])).toEqual([]);
  });

  it('ignores unrecognized names but keeps recognized ones', () => {
    expect(recommendedAbilityKeys(['Charisma', 'Luck'])).toEqual(['charisma']);
  });
});
