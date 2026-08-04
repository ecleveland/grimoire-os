import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_ABILITY_MAP } from '@grimoire-os/shared';
import { srdBackgrounds } from './backgrounds';

// A `Set` rather than `in`/`hasOwnProperty` on the map: `'toString' in obj` is
// true for every object, so a seeded skill named after an Object.prototype
// member would slip past that check.
const CANONICAL_SKILLS = new Set(Object.keys(SKILL_ABILITY_MAP));

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
    it('grants only skills the canonical catalog knows (drift guard)', () => {
      // These names reach `Character.skills` verbatim via the guided builder's
      // OriginStep, and the sheet renders `computed.skills` — which is keyed off
      // the catalog. A typo here doesn't error, it silently renders the intended
      // skill as unproficient (VEG-492).
      const unknown = background.skillProficiencies.filter(s => !CANONICAL_SKILLS.has(s));
      expect(unknown).toEqual([]);
    });

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
