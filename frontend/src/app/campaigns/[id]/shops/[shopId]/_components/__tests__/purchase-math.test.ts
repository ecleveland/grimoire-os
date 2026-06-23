import { describe, it, expect } from 'vitest';
import { toCopper, type Currency } from '@grimoire-os/shared';
import { canAffordLine, lineTotal } from '../purchase-math';

const gp = (n: number): Currency => ({ cp: 0, sp: 0, ep: 0, gp: n, pp: 0 });

describe('purchase-math', () => {
  describe('lineTotal', () => {
    it('multiplies the unit price by quantity', () => {
      expect(toCopper(lineTotal(gp(50), 3))).toBe(15_000);
    });

    it('returns the unit price for quantity 1', () => {
      expect(toCopper(lineTotal(gp(50), 1))).toBe(5_000);
    });

    it('is zero for a non-positive quantity', () => {
      expect(toCopper(lineTotal(gp(50), 0))).toBe(0);
    });

    it('truncates a fractional quantity', () => {
      expect(toCopper(lineTotal(gp(50), 2.9))).toBe(10_000); // floor → 2 units
    });
  });

  describe('canAffordLine', () => {
    it('is true when the balance covers quantity × price', () => {
      expect(canAffordLine(gp(100), gp(50), 1)).toBe(true);
    });

    it('is true at the exact boundary', () => {
      expect(canAffordLine(gp(100), gp(50), 2)).toBe(true); // 100 gp == 100 gp
    });

    it('is false when affordable at 1 but not at the requested quantity', () => {
      expect(canAffordLine(gp(100), gp(50), 3)).toBe(false); // needs 150 gp
    });

    it('treats a free item as always affordable', () => {
      expect(canAffordLine(gp(0), gp(0), 5)).toBe(true);
    });
  });
});
