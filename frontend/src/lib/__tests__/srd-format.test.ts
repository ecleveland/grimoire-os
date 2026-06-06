import { describe, it, expect } from 'vitest';
import { formatCr, abilityModifier } from '../srd-format';

describe('formatCr', () => {
  it('prints fractional CRs the 5e way', () => {
    expect(formatCr(0.125)).toBe('1/8');
    expect(formatCr(0.25)).toBe('1/4');
    expect(formatCr(0.5)).toBe('1/2');
  });

  it('prints whole CRs as plain numbers', () => {
    expect(formatCr(0)).toBe('0');
    expect(formatCr(1)).toBe('1');
    expect(formatCr(24)).toBe('24');
  });
});

describe('abilityModifier', () => {
  it('formats positive modifiers with a leading plus', () => {
    expect(abilityModifier(10)).toBe('+0');
    expect(abilityModifier(11)).toBe('+0');
    expect(abilityModifier(12)).toBe('+1');
    expect(abilityModifier(30)).toBe('+10');
  });

  it('formats negative modifiers with a minus', () => {
    expect(abilityModifier(9)).toBe('-1');
    expect(abilityModifier(8)).toBe('-1');
    expect(abilityModifier(1)).toBe('-5');
  });
});
