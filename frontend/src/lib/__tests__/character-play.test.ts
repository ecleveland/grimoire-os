import { describe, it, expect } from 'vitest';
import {
  damageHitPoints,
  healHitPoints,
  setTempHitPoints,
  togglePip,
  adjustHitDiceSpent,
  deathSavesAfterRevive,
  parseNonNegativeInt,
  CLEARED_DEATH_SAVES,
} from '../character-play';

describe('character-play HP helpers', () => {
  describe('damageHitPoints', () => {
    it('spends temp HP before current', () => {
      expect(damageHitPoints({ max: 20, current: 18, temporary: 5 }, 3)).toEqual({
        max: 20,
        current: 18,
        temporary: 2,
      });
    });

    it('overflows past temp into current', () => {
      expect(damageHitPoints({ max: 20, current: 18, temporary: 5 }, 8)).toEqual({
        max: 20,
        current: 15,
        temporary: 0,
      });
    });

    it('floors current at 0 and never goes negative', () => {
      expect(damageHitPoints({ max: 20, current: 4, temporary: 0 }, 100)).toEqual({
        max: 20,
        current: 0,
        temporary: 0,
      });
    });

    it('ignores non-positive amounts', () => {
      const hp = { max: 20, current: 18, temporary: 5 };
      expect(damageHitPoints(hp, 0)).toEqual(hp);
      expect(damageHitPoints(hp, -5)).toEqual(hp);
    });
  });

  describe('healHitPoints', () => {
    it('raises current, clamped to max, leaving temp untouched', () => {
      expect(healHitPoints({ max: 20, current: 15, temporary: 4 }, 100)).toEqual({
        max: 20,
        current: 20,
        temporary: 4,
      });
    });

    it('ignores non-positive amounts', () => {
      const hp = { max: 20, current: 10, temporary: 0 };
      expect(healHitPoints(hp, 0)).toEqual(hp);
    });
  });

  describe('setTempHitPoints', () => {
    it('sets temp HP directly (overwrites, not max-stacking)', () => {
      expect(setTempHitPoints({ max: 20, current: 10, temporary: 8 }, 3)).toEqual({
        max: 20,
        current: 10,
        temporary: 3,
      });
    });

    it('clamps to a non-negative integer', () => {
      expect(setTempHitPoints({ max: 20, current: 10, temporary: 8 }, -5).temporary).toBe(0);
      expect(setTempHitPoints({ max: 20, current: 10, temporary: 8 }, 4.7).temporary).toBe(4);
    });
  });
});

describe('togglePip', () => {
  it('fills up to and including the clicked index', () => {
    expect(togglePip(0, 0, 3)).toBe(1); // click first → 1
    expect(togglePip(0, 2, 3)).toBe(3); // click third → 3
    expect(togglePip(1, 2, 3)).toBe(3); // extend from 1 to 3
  });

  it('clears the highest filled pip when re-clicked', () => {
    expect(togglePip(3, 2, 3)).toBe(2); // click the last filled → drop to 2
    expect(togglePip(1, 0, 3)).toBe(0); // click only filled → clear
  });

  it('clamps to max (used for spell slots bounded by total)', () => {
    expect(togglePip(0, 4, 2)).toBe(2); // index beyond max clamps down
  });
});

describe('adjustHitDiceSpent', () => {
  const hd = { dieType: 'd10' as const, total: 8, spent: 3 };

  it('spends one (caps at total)', () => {
    expect(adjustHitDiceSpent(hd, 1).spent).toBe(4);
    expect(adjustHitDiceSpent({ ...hd, spent: 8 }, 1).spent).toBe(8);
  });

  it('restores one (floors at 0)', () => {
    expect(adjustHitDiceSpent(hd, -1).spent).toBe(2);
    expect(adjustHitDiceSpent({ ...hd, spent: 0 }, -1).spent).toBe(0);
  });

  it('preserves dieType and total', () => {
    expect(adjustHitDiceSpent(hd, 1)).toEqual({ dieType: 'd10', total: 8, spent: 4 });
  });
});

describe('CLEARED_DEATH_SAVES', () => {
  it('is a zeroed track for revive-above-0', () => {
    expect(CLEARED_DEATH_SAVES).toEqual({ successes: 0, failures: 0 });
  });
});

describe('deathSavesAfterRevive', () => {
  it('returns a zeroed track when healed above 0 with saves present', () => {
    expect(deathSavesAfterRevive(5, { successes: 1, failures: 2 })).toEqual({
      successes: 0,
      failures: 0,
    });
  });

  it('returns null when still at 0 (no revive)', () => {
    expect(deathSavesAfterRevive(0, { successes: 1, failures: 2 })).toBeNull();
  });

  it('returns null when there are no saves to clear', () => {
    expect(deathSavesAfterRevive(5, { successes: 0, failures: 0 })).toBeNull();
  });
});

describe('parseNonNegativeInt', () => {
  it('parses a positive integer', () => {
    expect(parseNonNegativeInt('12')).toBe(12);
  });

  it('floors fractional input', () => {
    expect(parseNonNegativeInt('4.7')).toBe(4);
  });

  it('clamps negatives to 0', () => {
    expect(parseNonNegativeInt('-5')).toBe(0);
  });

  it('treats blank/non-numeric as 0', () => {
    expect(parseNonNegativeInt('')).toBe(0);
    expect(parseNonNegativeInt('abc')).toBe(0);
  });
});
