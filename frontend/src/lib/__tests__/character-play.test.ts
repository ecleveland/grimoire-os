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
  applyShortRest,
  toggleConditionInList,
  setExhaustionLevel,
  concentrationFromSpellInput,
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

  it('tolerates a null spellSlots (the API returns null for non-casters)', () => {
    // Regression: Character types spellSlots as non-optional, but real data has
    // null — `.length` on it threw at runtime (VEG-407 manual test).
    const patch = applyLongRest({ ...base, spellSlots: null });
    expect('spellSlots' in patch).toBe(false);
    expect(patch.hitPoints).toEqual({ max: 44, current: 44, temporary: 0 });
  });

  it('tolerates a null hitDice', () => {
    const patch = applyLongRest({ ...base, hitDice: null });
    expect('hitDice' in patch).toBe(false);
  });

  it('omits hitPoints for a null-HP character (never persists a fabricated block)', () => {
    // Regression (VEG-425): Character declared hitPoints non-optional, but the
    // column is `Json?`; `{ ...null }` threw. A minimal character rests without a
    // hitPoints patch — we must not write a fabricated {0,0,0} block to the DB.
    const patch = applyLongRest({ ...base, hitPoints: null });
    expect('hitPoints' in patch).toBe(false);
    // The rest still clears death saves and regains hit dice.
    expect(patch.deathSaves).toEqual({ successes: 0, failures: 0 });
    expect(patch.hitDice).toEqual({ dieType: 'd10', total: 8, spent: 1 });
  });

  // ── Resource recovery (VEG-409) ─────────────────────────
  const ki = { name: 'Ki Points', max: 5, used: 3, recharge: 'short' as const };
  const rage = { name: 'Rage', max: 3, used: 2, recharge: 'long' as const };

  it('resets every resource (short and long recharge) to used:0', () => {
    const patch = applyLongRest({ ...base, resources: [ki, rage] });
    expect(patch.resources).toEqual([
      { ...ki, used: 0 },
      { ...rage, used: 0 },
    ]);
  });

  it('omits resources from the patch when the character has none', () => {
    expect('resources' in applyLongRest(base)).toBe(false);
    expect('resources' in applyLongRest({ ...base, resources: null })).toBe(false);
    expect('resources' in applyLongRest({ ...base, resources: [] })).toBe(false);
  });
});

describe('applyShortRest (VEG-409)', () => {
  const ki = { name: 'Ki Points', max: 5, used: 3, recharge: 'short' as const };
  const rage = { name: 'Rage', max: 3, used: 2, recharge: 'long' as const };

  it("resets only recharge:'short' resources, leaving long-rest pools spent", () => {
    const patch = applyShortRest({ resources: [ki, rage] });
    expect(patch.resources).toEqual([{ ...ki, used: 0 }, rage]);
  });

  it('patches only resources — HP, hit dice, slots, and death saves are untouched', () => {
    expect(Object.keys(applyShortRest({ resources: [ki] }))).toEqual(['resources']);
  });

  it('returns an empty patch when the character has no resources', () => {
    expect(applyShortRest({ resources: null })).toEqual({});
    expect(applyShortRest({ resources: [] })).toEqual({});
    expect(applyShortRest({})).toEqual({});
  });

  it('returns an empty patch when no short-recharge resource has uses to recover', () => {
    // Patching an identical array would burn an optimistic-lock version and
    // 409 a concurrent session for a click that changed nothing.
    expect(applyShortRest({ resources: [rage] })).toEqual({});
    expect(applyShortRest({ resources: [{ ...ki, used: 0 }, rage] })).toEqual({});
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

describe('status tracker helpers (VEG-408)', () => {
  describe('toggleConditionInList', () => {
    it('adds a condition not in the list', () => {
      expect(toggleConditionInList(['Poisoned'], 'Prone')).toEqual(['Poisoned', 'Prone']);
    });

    it('removes a condition already in the list', () => {
      expect(toggleConditionInList(['Poisoned', 'Prone'], 'Poisoned')).toEqual(['Prone']);
    });

    it('adds to an empty list', () => {
      expect(toggleConditionInList([], 'Blinded')).toEqual(['Blinded']);
    });

    it('does not mutate the input list', () => {
      const input: ReturnType<typeof toggleConditionInList> = ['Poisoned'];
      toggleConditionInList(input, 'Prone');
      expect(input).toEqual(['Poisoned']);
    });
  });

  describe('setExhaustionLevel', () => {
    it('sets a level 1-6', () => {
      expect(setExhaustionLevel(null, 3)).toBe(3);
      expect(setExhaustionLevel(2, 6)).toBe(6);
    });

    it('clears when clicking the current level', () => {
      expect(setExhaustionLevel(3, 3)).toBeNull();
    });

    it('clears for out-of-range levels', () => {
      expect(setExhaustionLevel(2, 0)).toBeNull();
      expect(setExhaustionLevel(2, 7)).toBeNull();
    });
  });

  describe('concentrationFromSpellInput', () => {
    it('names the spell when non-empty', () => {
      expect(concentrationFromSpellInput('Bless')).toEqual({ spell: 'Bless' });
    });

    it('trims whitespace', () => {
      expect(concentrationFromSpellInput('  Hold Person  ')).toEqual({ spell: 'Hold Person' });
    });

    it('drops the name but keeps concentrating on empty input', () => {
      expect(concentrationFromSpellInput('')).toEqual({});
      expect(concentrationFromSpellInput('   ')).toEqual({});
    });
  });
});
