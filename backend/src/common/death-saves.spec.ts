// Tests for the shared death-save revive rule (VEG-553). The encounter tracker
// and the character sheet both clear the track when a heal lands above 0 HP, so
// the rule lives in @grimoire-os/shared; the backend hosts the tests, the same
// pattern as coin.spec.ts.

import { CLEARED_DEATH_SAVES, hasDeathSaves, reviveDeathSaves } from '@grimoire-os/shared';

describe('CLEARED_DEATH_SAVES', () => {
  it('is a zeroed track', () => {
    expect(CLEARED_DEATH_SAVES).toEqual({ successes: 0, failures: 0 });
  });
});

describe('hasDeathSaves', () => {
  it.each([
    ['a success alone', { successes: 1, failures: 0 }, true],
    ['a failure alone', { successes: 0, failures: 2 }, true],
    ['an empty track', { successes: 0, failures: 0 }, false],
  ])('is %s -> %s', (_label, saves, expected) => {
    expect(hasDeathSaves(saves)).toBe(expected);
  });
});

describe('reviveDeathSaves', () => {
  it('returns a cleared track when HP is above 0 and a tally is set', () => {
    expect(reviveDeathSaves(5, { successes: 1, failures: 2 })).toEqual({
      successes: 0,
      failures: 0,
    });
  });

  it('returns a fresh object each call, never the shared constant', () => {
    const cleared = reviveDeathSaves(1, { successes: 0, failures: 1 });
    expect(cleared).not.toBe(CLEARED_DEATH_SAVES);
    expect(cleared).not.toBe(reviveDeathSaves(1, { successes: 0, failures: 1 }));
  });

  it('returns null while HP is still 0 or below', () => {
    expect(reviveDeathSaves(0, { successes: 1, failures: 2 })).toBeNull();
    expect(reviveDeathSaves(-4, { successes: 2, failures: 0 })).toBeNull();
  });

  it('returns null when the track is already empty', () => {
    expect(reviveDeathSaves(5, { successes: 0, failures: 0 })).toBeNull();
  });

  it('returns null when there is no track', () => {
    expect(reviveDeathSaves(5, undefined)).toBeNull();
    expect(reviveDeathSaves(5, null)).toBeNull();
  });
});
