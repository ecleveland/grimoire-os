import {
  isLevelCountMap,
  isPactProgression,
  isSlotProgression,
  MAX_CHARACTER_LEVEL,
} from './level-keyed-map.decorator';

/**
 * The three progression-table checks, driven directly rather than only through
 * `CreateClassDto`.
 *
 * The DTO spec exercises one of them through one field, which left the bounds,
 * the key round-trip and `isPactProgression` entirely unpinned: eleven separate
 * mutations of this file survived the whole backend suite. These are pure
 * predicates, so testing them here is both cheaper and stricter than routing
 * every case through the pipe.
 */

describe('isLevelCountMap', () => {
  it('accepts a level-keyed count map', () => {
    expect(isLevelCountMap({ 1: 2, 20: 0 })).toBe(true);
    expect(isLevelCountMap({})).toBe(true);
  });

  it('rejects a non-object', () => {
    for (const value of [null, undefined, 'nope', 7, [] as unknown]) {
      expect(isLevelCountMap(value)).toBe(false);
    }
  });

  it('rejects a level outside 1..20', () => {
    expect(isLevelCountMap({ 0: 1 })).toBe(false);
    expect(isLevelCountMap({ [MAX_CHARACTER_LEVEL + 1]: 1 })).toBe(false);
    expect(isLevelCountMap({ 47: 1 })).toBe(false);
  });

  it('rejects a key that is not the plain decimal form of its level', () => {
    // Number(' 1 ') is 1 and Number('') is 0, so a parse alone would let these in.
    expect(isLevelCountMap({ ' 1 ': 2 })).toBe(false);
    expect(isLevelCountMap({ '01': 2 })).toBe(false);
    expect(isLevelCountMap({ '1.0': 2 })).toBe(false);
    expect(isLevelCountMap({ '': 2 })).toBe(false);
    expect(isLevelCountMap({ '1e0': 2 })).toBe(false);
  });

  it('rejects a count that is not a non-negative integer within bounds', () => {
    expect(isLevelCountMap({ 1: 'two' })).toBe(false);
    expect(isLevelCountMap({ 1: -1 })).toBe(false);
    expect(isLevelCountMap({ 1: 1.5 })).toBe(false);
    expect(isLevelCountMap({ 1: 5000 })).toBe(false);
    expect(isLevelCountMap({ 1: NaN })).toBe(false);
  });
});

describe('isSlotProgression', () => {
  it('accepts a level to slot-level to count table', () => {
    expect(isSlotProgression({ 1: { 1: 2 }, 20: { 9: 1 } })).toBe(true);
  });

  it('rejects a non-object at either level', () => {
    expect(isSlotProgression('nope')).toBe(false);
    expect(isSlotProgression([])).toBe(false);
    expect(isSlotProgression({ 1: 2 })).toBe(false);
    expect(isSlotProgression({ 1: [] })).toBe(false);
  });

  it('rejects a slot level outside 1..9', () => {
    expect(isSlotProgression({ 1: { 0: 1 } })).toBe(false);
    expect(isSlotProgression({ 1: { 10: 1 } })).toBe(false);
    expect(isSlotProgression({ 1: { 12: 1 } })).toBe(false);
  });

  it('rejects a character level outside 1..20', () => {
    expect(isSlotProgression({ 21: { 1: 1 } })).toBe(false);
  });

  it('rejects a non-integer slot count', () => {
    expect(isSlotProgression({ 1: { 1: 'two' } })).toBe(false);
    expect(isSlotProgression({ 1: { 1: -3 } })).toBe(false);
  });
});

describe('isPactProgression', () => {
  it('accepts a level to { slots, slotLevel } table', () => {
    expect(
      isPactProgression({ 1: { slots: 1, slotLevel: 1 }, 20: { slots: 4, slotLevel: 5 } })
    ).toBe(true);
  });

  it('rejects a non-object at either level', () => {
    expect(isPactProgression('nope')).toBe(false);
    expect(isPactProgression({ 1: 'nope' })).toBe(false);
    expect(isPactProgression({ 1: [] })).toBe(false);
  });

  it('requires exactly the two keys, no more and no fewer', () => {
    expect(isPactProgression({ 1: { slots: 1 } })).toBe(false);
    expect(isPactProgression({ 1: { slotLevel: 1 } })).toBe(false);
    expect(isPactProgression({ 1: { slots: 1, slotLevel: 1, extra: 1 } })).toBe(false);
    expect(isPactProgression({ 1: { slots: 1, wrongName: 1 } })).toBe(false);
  });

  it('bounds slots and slotLevel', () => {
    expect(isPactProgression({ 1: { slots: 1, slotLevel: 40 } })).toBe(false);
    expect(isPactProgression({ 1: { slots: 1, slotLevel: 0 } })).toBe(false);
    expect(isPactProgression({ 1: { slots: 'two', slotLevel: 1 } })).toBe(false);
    expect(isPactProgression({ 1: { slots: -1, slotLevel: 1 } })).toBe(false);
    expect(isPactProgression({ 1: { slots: 5000, slotLevel: 1 } })).toBe(false);
  });

  it('rejects a character level outside 1..20', () => {
    expect(isPactProgression({ 0: { slots: 1, slotLevel: 1 } })).toBe(false);
  });
});
