import { inverseOf } from './relation-inverses';

describe('inverseOf', () => {
  const mapped: Array<[string, string]> = [
    ['parent', 'child'],
    ['child', 'parent'],
    ['mentor', 'student'],
    ['student', 'mentor'],
    ['boss', 'subordinate'],
    ['subordinate', 'boss'],
  ];

  const symmetric = ['sibling', 'spouse', 'rival', 'ally', 'friend', 'enemy'];

  it.each(mapped)('maps %s -> %s', (forward, inverse) => {
    expect(inverseOf(forward)).toBe(inverse);
  });

  it.each(symmetric)('keeps %s symmetric', relation => {
    expect(inverseOf(relation)).toBe(relation);
  });

  const roundtripCases = [...mapped, ...mapped.map(([a, b]) => [b, a] as [string, string])].map(
    ([forward]) => [forward] as [string]
  );
  it.each(roundtripCases)(
    'is its own involution: inverseOf(inverseOf(%s)) returns input',
    forward => {
      expect(inverseOf(inverseOf(forward))).toBe(forward);
    }
  );

  it('falls back to symmetric for unknown (custom) relations', () => {
    expect(inverseOf('blood-bound')).toBe('blood-bound');
    expect(inverseOf('arch-nemesis')).toBe('arch-nemesis');
    expect(inverseOf('')).toBe('');
  });

  it('is case-sensitive (no normalization)', () => {
    expect(inverseOf('Parent')).toBe('Parent');
    expect(inverseOf('PARENT')).toBe('PARENT');
  });
});
