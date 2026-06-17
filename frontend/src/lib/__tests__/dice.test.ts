import { describe, it, expect } from 'vitest';
import {
  rollDie,
  rollD20,
  parseDiceExpression,
  rollExpression,
  parseModifier,
  formatD20Result,
  formatExpressionResult,
} from '../dice';

// Deterministic rng: cycles through the given fractions.
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('rollDie', () => {
  it('maps rng to 1..sides', () => {
    expect(rollDie(20, () => 0)).toBe(1);
    expect(rollDie(20, () => 0.999999)).toBe(20);
    expect(rollDie(6, () => 0.5)).toBe(4);
  });
});

describe('rollD20', () => {
  it('adds modifier to a single roll in normal mode', () => {
    const r = rollD20(3, 'normal', () => 0.5); // floor(0.5*20)+1 = 11
    expect(r.rolls).toEqual([11]);
    expect(r.natural).toBe(11);
    expect(r.total).toBe(14);
    expect(r.mode).toBe('normal');
  });

  it('keeps the higher of two on advantage', () => {
    const r = rollD20(0, 'advantage', seq(0.1, 0.9)); // 3 and 19
    expect(r.rolls).toEqual([3, 19]);
    expect(r.natural).toBe(19);
    expect(r.total).toBe(19);
  });

  it('keeps the lower of two on disadvantage', () => {
    const r = rollD20(2, 'disadvantage', seq(0.1, 0.9)); // 3 and 19
    expect(r.natural).toBe(3);
    expect(r.total).toBe(5);
  });

  it('defaults to a modifier of 0 and normal mode', () => {
    const r = rollD20(undefined, undefined, () => 0);
    expect(r.total).toBe(1);
    expect(r.mode).toBe('normal');
  });
});

describe('parseDiceExpression', () => {
  it('parses count, sides, and modifier', () => {
    expect(parseDiceExpression('2d6+3')).toEqual({ count: 2, sides: 6, modifier: 3 });
  });

  it('defaults count to 1 and modifier to 0', () => {
    expect(parseDiceExpression('d20')).toEqual({ count: 1, sides: 20, modifier: 0 });
    expect(parseDiceExpression('1d8')).toEqual({ count: 1, sides: 8, modifier: 0 });
  });

  it('handles negative modifiers and whitespace', () => {
    expect(parseDiceExpression(' 1d10 - 1 ')).toEqual({ count: 1, sides: 10, modifier: -1 });
  });

  it('returns null for non-dice text', () => {
    expect(parseDiceExpression('+5')).toBeNull();
    expect(parseDiceExpression('slashing')).toBeNull();
    expect(parseDiceExpression('')).toBeNull();
  });
});

describe('rollExpression', () => {
  it('rolls each die and adds the modifier', () => {
    const r = rollExpression('2d6+3', seq(0.5, 0.99)); // 4 and 6
    expect(r).not.toBeNull();
    expect(r!.rolls).toEqual([4, 6]);
    expect(r!.total).toBe(13);
    expect(r!.expression).toBe('2d6+3');
  });

  it('returns null for unparseable input', () => {
    expect(rollExpression('not dice')).toBeNull();
  });
});

describe('parseModifier', () => {
  it('extracts a leading signed integer', () => {
    expect(parseModifier('+5')).toBe(5);
    expect(parseModifier('-1')).toBe(-1);
    expect(parseModifier('7 / DC 15')).toBe(7);
  });

  it('returns null when there is no leading number', () => {
    expect(parseModifier('DC 13')).toBeNull();
    expect(parseModifier('')).toBeNull();
  });
});

describe('formatters', () => {
  it('formats a normal d20 result with a positive modifier', () => {
    expect(
      formatD20Result(
        'Dexterity check',
        rollD20(2, 'normal', () => 0.65)
      )
    ).toBe('Dexterity check: 14 + 2 = 16');
  });

  it('formats a d20 result with no modifier and advantage', () => {
    expect(formatD20Result('Initiative', rollD20(0, 'advantage', seq(0.1, 0.9)))).toBe(
      'Initiative: 3/19 → 19 = 19'
    );
  });

  it('formats a negative modifier with a minus sign', () => {
    const out = formatD20Result(
      'Save',
      rollD20(-1, 'normal', () => 0)
    );
    expect(out).toBe('Save: 1 − 1 = 0');
  });

  it('formats an expression result', () => {
    expect(
      formatExpressionResult('Longsword damage', rollExpression('2d6+2', seq(0.5, 0.5))!)
    ).toBe('Longsword damage: [4, 4] + 2 = 10');
  });
});
