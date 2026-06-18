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
  hitDiceRegainedOnLongRest,
  applyLongRest,
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

describe('hitDiceRegainedOnLongRest', () => {
  it('regains half the total hit dice, rounded down', () => {
    expect(hitDiceRegainedOnLongRest(10)).toBe(5);
    expect(hitDiceRegainedOnLongRest(5)).toBe(2);
    expect(hitDiceRegainedOnLongRest(2)).toBe(1);
  });

  it('regains at least one die — the 5e minimum (a level-1 PC)', () => {
    expect(hitDiceRegainedOnLongRest(1)).toBe(1);
  });
});

describe('applyLongRest', () => {
  const base = {
    hitPoints: { max: 44, current: 12, temporary: 6 },
    spellSlots: [],
    hitDice: { dieType: 'd10' as const, total: 8, spent: 5 },
  };

  it('restores HP to max and clears temp HP', () => {
    expect(applyLongRest(base).hitPoints).toEqual({ max: 44, current: 44, temporary: 0 });
  });

  it('clears death saves', () => {
    expect(applyLongRest(base).deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it('regains half the total hit dice (rounded down), capped at the number spent', () => {
    // total 8 → regain 4; spent 5 → 1 remaining spent
    expect(applyLongRest(base).hitDice).toEqual({ dieType: 'd10', total: 8, spent: 1 });
  });

  it('never restores more hit dice than were spent', () => {
    // total 8 → regain 4, but only 2 spent → floors at 0
    const patch = applyLongRest({ ...base, hitDice: { dieType: 'd10', total: 8, spent: 2 } });
    expect(patch.hitDice).toEqual({ dieType: 'd10', total: 8, spent: 0 });
  });

  it('regains at least one hit die for a level-1 character', () => {
    const patch = applyLongRest({ ...base, hitDice: { dieType: 'd8', total: 1, spent: 1 } });
    expect(patch.hitDice).toEqual({ dieType: 'd8', total: 1, spent: 0 });
  });

  it('omits hitDice from the patch when the character has none', () => {
    const patch = applyLongRest({ ...base, hitDice: undefined });
    expect('hitDice' in patch).toBe(false);
  });

  it('resets every spell slot to used:0', () => {
    const patch = applyLongRest({
      ...base,
      spellSlots: [
        { level: 1, total: 4, used: 3 },
        { level: 2, total: 3, used: 1 },
      ],
    });
    expect(patch.spellSlots).toEqual([
      { level: 1, total: 4, used: 0 },
      { level: 2, total: 3, used: 0 },
    ]);
  });

  it('omits spellSlots from the patch for a non-caster (no slots)', () => {
    expect('spellSlots' in applyLongRest(base)).toBe(false);
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
