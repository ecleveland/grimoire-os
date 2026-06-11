import { describe, it, expect } from 'vitest';
import type { Combatant } from '@grimoire-os/shared';
import { applyDamage, applyHeal, grantTempHp } from '@/lib/combatant-hp';

// Shared-type regression (VEG-286): `tempHp` is part of the embedded Combatant
// shape, so a fully-populated combatant must type-check against the shared
// interface and carry the value through untouched.
describe('shared Combatant type', () => {
  it('accepts an optional tempHp field', () => {
    const combatant: Combatant = {
      name: 'Goblin',
      initiative: 12,
      hp: 7,
      maxHp: 7,
      tempHp: 5,
      ac: 13,
      isNpc: true,
    };
    expect(combatant.tempHp).toBe(5);
  });

  it('still accepts combatants without tempHp', () => {
    const combatant: Combatant = {
      name: 'Hero',
      initiative: 18,
      hp: 24,
      maxHp: 24,
      ac: 16,
      isNpc: false,
    };
    expect(combatant.tempHp).toBeUndefined();
  });
});

describe('applyDamage', () => {
  it('spends temp HP before real HP', () => {
    expect(applyDamage({ hp: 10, tempHp: 5 }, 3)).toEqual({ hp: 10, tempHp: 2 });
  });

  it('spills into real HP once temp is exhausted', () => {
    expect(applyDamage({ hp: 10, tempHp: 5 }, 8)).toEqual({ hp: 7, tempHp: 0 });
  });

  it('damage exactly equal to temp leaves real HP untouched', () => {
    expect(applyDamage({ hp: 10, tempHp: 5 }, 5)).toEqual({ hp: 10, tempHp: 0 });
  });

  it('treats absent tempHp as 0', () => {
    expect(applyDamage({ hp: 10 }, 4)).toEqual({ hp: 6, tempHp: 0 });
  });

  it('clamps real HP at 0 on overkill', () => {
    expect(applyDamage({ hp: 3, tempHp: 2 }, 99)).toEqual({ hp: 0, tempHp: 0 });
  });

  it('ignores non-positive amounts', () => {
    expect(applyDamage({ hp: 10, tempHp: 5 }, 0)).toEqual({ hp: 10, tempHp: 5 });
    expect(applyDamage({ hp: 10, tempHp: 5 }, -4)).toEqual({ hp: 10, tempHp: 5 });
  });
});

describe('applyHeal', () => {
  it('adds to real HP', () => {
    expect(applyHeal({ hp: 5, maxHp: 20 }, 6)).toEqual({ hp: 11 });
  });

  it('clamps to maxHp', () => {
    expect(applyHeal({ hp: 18, maxHp: 20 }, 10)).toEqual({ hp: 20 });
  });

  it('heals from 0 (revival is a normal heal)', () => {
    expect(applyHeal({ hp: 0, maxHp: 20 }, 7)).toEqual({ hp: 7 });
  });

  it('does not touch temp HP', () => {
    expect(applyHeal({ hp: 5, maxHp: 20, tempHp: 4 }, 6)).toEqual({ hp: 11 });
  });

  it('ignores non-positive amounts', () => {
    expect(applyHeal({ hp: 5, maxHp: 20 }, 0)).toEqual({ hp: 5 });
    expect(applyHeal({ hp: 5, maxHp: 20 }, -3)).toEqual({ hp: 5 });
  });
});

describe('grantTempHp', () => {
  it('grants temp HP when there is none', () => {
    expect(grantTempHp({}, 8)).toBe(8);
  });

  it('takes the higher value instead of stacking', () => {
    expect(grantTempHp({ tempHp: 5 }, 8)).toBe(8);
    expect(grantTempHp({ tempHp: 8 }, 5)).toBe(8);
  });

  it('keeps the existing value on an equal grant', () => {
    expect(grantTempHp({ tempHp: 5 }, 5)).toBe(5);
  });

  it('ignores non-positive amounts', () => {
    expect(grantTempHp({ tempHp: 5 }, 0)).toBe(5);
    expect(grantTempHp({ tempHp: 5 }, -2)).toBe(5);
    expect(grantTempHp({}, 0)).toBe(0);
  });
});
