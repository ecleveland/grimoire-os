import { describe, expect, it } from 'vitest';
import { asDieType } from '@/lib/types';

describe('asDieType', () => {
  it('narrows a valid die string', () => {
    expect(asDieType('d10')).toBe('d10');
    expect(asDieType('d6')).toBe('d6');
  });

  it('returns null for a present-but-invalid die string so callers keep their fallback', () => {
    expect(asDieType('d7')).toBeNull();
    expect(asDieType('D10')).toBeNull();
    expect(asDieType('')).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(asDieType(undefined)).toBeNull();
  });
});
