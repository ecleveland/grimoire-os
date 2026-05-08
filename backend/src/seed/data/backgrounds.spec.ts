import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { srdBackgrounds } from './backgrounds';

describe('SRD backgrounds seed data', () => {
  describe('license attribution', () => {
    it('declares SRD 5.0 CC-BY-4.0 attribution at the top of backgrounds.ts', () => {
      const source = readFileSync(join(__dirname, 'backgrounds.ts'), 'utf8');
      const head = source.split('\n').slice(0, 10).join('\n');
      expect(head).toMatch(/SRD\s*v?5\.0/i);
      expect(head).toMatch(/CC[- ]BY[- ]?4\.0/i);
    });
  });

  describe.each(srdBackgrounds.map(b => [b.name, b] as const))('%s', (_name, background) => {
    it('has at least 6 personality traits', () => {
      expect(background.personalityTraits.length).toBeGreaterThanOrEqual(6);
    });

    it('has at least 4 ideals', () => {
      expect(background.ideals.length).toBeGreaterThanOrEqual(4);
    });

    it('has at least 4 bonds', () => {
      expect(background.bonds.length).toBeGreaterThanOrEqual(4);
    });

    it('has at least 4 flaws', () => {
      expect(background.flaws.length).toBeGreaterThanOrEqual(4);
    });

    it('has only non-empty trimmed strings in every personality array', () => {
      for (const arr of [
        background.personalityTraits,
        background.ideals,
        background.bonds,
        background.flaws,
      ]) {
        for (const entry of arr) {
          expect(typeof entry).toBe('string');
          expect(entry.trim().length).toBeGreaterThan(0);
        }
      }
    });

    it('has unique entries within each personality array', () => {
      for (const arr of [
        background.personalityTraits,
        background.ideals,
        background.bonds,
        background.flaws,
      ]) {
        expect(new Set(arr).size).toBe(arr.length);
      }
    });
  });
});
