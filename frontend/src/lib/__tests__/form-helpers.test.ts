import { describe, it, expect } from 'vitest';
import { clampIntToRange, parseIntInRange } from '../form-helpers';

describe('clampIntToRange', () => {
  it('passes a value already inside the range through untouched', () => {
    expect(clampIntToRange('30', 0, 999)).toBe(30);
  });

  it('pins a value past the ceiling to max', () => {
    expect(clampIntToRange('5000', 0, 999)).toBe(999);
  });

  it('pins a value below the floor to min', () => {
    expect(clampIntToRange('-5', 0, 999)).toBe(0);
  });

  it('keeps the bounds themselves (inclusive at both ends)', () => {
    expect(clampIntToRange('0', 0, 999)).toBe(0);
    expect(clampIntToRange('999', 0, 999)).toBe(999);
  });

  it('allows a negative floor, so a symmetric bound keeps its sign', () => {
    expect(clampIntToRange('-3', -999, 999)).toBe(-3);
    expect(clampIntToRange('-5000', -999, 999)).toBe(-999);
  });

  it('floors a fractional value — the backing columns are int4', () => {
    expect(clampIntToRange('30.9', 0, 999)).toBe(30);
    // Toward -Infinity, matching parseNonNegativeInt's Math.floor rather than
    // truncating toward zero.
    expect(clampIntToRange('-3.2', -999, 999)).toBe(-4);
  });

  it('reads blank and unparseable input as 0 before clamping', () => {
    expect(clampIntToRange('', 0, 999)).toBe(0);
    expect(clampIntToRange('abc', 0, 999)).toBe(0);
  });

  it('clamps the 0 that blank input reads as, when the floor is above 0', () => {
    expect(clampIntToRange('', 1, 20)).toBe(1);
  });

  it('does not return Infinity for an infinite input', () => {
    expect(clampIntToRange('Infinity', 0, Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

// The clamping sibling above is easy to reach for by mistake, so pin the
// contrast: parseIntInRange REJECTS what clampIntToRange pins.
describe('parseIntInRange (contrast)', () => {
  it('returns null for out-of-range input instead of clamping it', () => {
    expect(parseIntInRange('5000', 0, 999)).toBeNull();
    expect(parseIntInRange('30', 0, 999)).toBe(30);
  });

  it('returns null for a fractional value instead of flooring it', () => {
    expect(parseIntInRange('30.9', 0, 999)).toBeNull();
  });
});
