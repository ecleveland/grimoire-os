import { describe, expect, it } from 'vitest';
import { asHitDie } from '@/lib/types';

describe('asHitDie', () => {
  it('narrows a valid hit die', () => {
    expect(asHitDie('d10')).toBe('d10');
    expect(asHitDie('d6')).toBe('d6');
  });

  // The reason this narrows against HIT_DIE_TYPES rather than DIE_TYPES
  // (VEG-530). Both are legal `SrdClass.hitDie` values — the content DTO
  // validates with `@IsIn(DIE_TYPES)` — and neither is a 5e hit die. Accepting
  // one would seed a pool the level-up picker cannot express and feed tens of
  // points a level into a permanent HP maximum.
  it('rejects the roll-only dice that a homebrew class may still declare', () => {
    expect(asHitDie('d20')).toBeNull();
    expect(asHitDie('d100')).toBeNull();
  });

  it('returns null for a present-but-invalid die string so callers keep their fallback', () => {
    expect(asHitDie('d7')).toBeNull();
    expect(asHitDie('D10')).toBeNull();
    expect(asHitDie('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(asHitDie(undefined)).toBeNull();
  });
});
