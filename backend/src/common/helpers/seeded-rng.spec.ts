import { SeededRng } from './seeded-rng';

describe('SeededRng', () => {
  describe('determinism', () => {
    it('returns identical sequences for the same string seed', () => {
      const a = new SeededRng('seed-1');
      const b = new SeededRng('seed-1');
      const aSeq = Array.from({ length: 20 }, () => a.nextFloat());
      const bSeq = Array.from({ length: 20 }, () => b.nextFloat());
      expect(aSeq).toEqual(bSeq);
    });

    it('returns different sequences for different seeds', () => {
      const a = new SeededRng('seed-1').nextFloat();
      const b = new SeededRng('seed-2').nextFloat();
      expect(a).not.toEqual(b);
    });
  });

  describe('nextFloat', () => {
    it('always returns a value in [0, 1)', () => {
      const rng = new SeededRng('range-check');
      for (let i = 0; i < 1000; i++) {
        const v = rng.nextFloat();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe('intInRange', () => {
    it('returns inclusive integers within [min, max]', () => {
      const rng = new SeededRng('int-range');
      for (let i = 0; i < 500; i++) {
        const v = rng.intInRange(3, 7);
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(7);
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it('returns the only possible value when min === max', () => {
      const rng = new SeededRng('singleton');
      expect(rng.intInRange(4, 4)).toBe(4);
    });
  });

  describe('rollDie', () => {
    it('parses NdM and produces values in the legal range', () => {
      const rng = new SeededRng('die');
      for (let i = 0; i < 500; i++) {
        const v = rng.rollDie('2d6');
        expect(v).toBeGreaterThanOrEqual(2);
        expect(v).toBeLessThanOrEqual(12);
      }
    });

    it('handles a leading "d" as 1dN', () => {
      const rng = new SeededRng('die-d');
      const v = rng.rollDie('d4');
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(4);
    });

    it('throws on malformed input', () => {
      const rng = new SeededRng('die-bad');
      expect(() => rng.rollDie('garbage')).toThrow();
    });
  });

  describe('pickOne', () => {
    it('returns one of the supplied items', () => {
      const rng = new SeededRng('pick-one');
      const items = ['a', 'b', 'c'];
      for (let i = 0; i < 50; i++) {
        expect(items).toContain(rng.pickOne(items));
      }
    });

    it('throws on an empty array', () => {
      const rng = new SeededRng('pick-empty');
      expect(() => rng.pickOne([])).toThrow();
    });
  });

  describe('weightedPick', () => {
    it('honors weights — heavy items dominate the distribution', () => {
      const rng = new SeededRng('weighted');
      const counts: Record<'a' | 'b' | 'c', number> = { a: 0, b: 0, c: 0 };
      for (let i = 0; i < 4000; i++) {
        const choice = rng.weightedPick<'a' | 'b' | 'c'>([
          { value: 'a', weight: 10 },
          { value: 'b', weight: 80 },
          { value: 'c', weight: 10 },
        ]);
        counts[choice]++;
      }
      expect(counts.b).toBeGreaterThan(counts.a + counts.c);
      expect(counts.a).toBeGreaterThan(0);
      expect(counts.c).toBeGreaterThan(0);
    });

    it('skips zero-weight entries', () => {
      const rng = new SeededRng('weighted-zero');
      for (let i = 0; i < 200; i++) {
        const choice = rng.weightedPick([
          { value: 'a', weight: 0 },
          { value: 'b', weight: 1 },
        ]);
        expect(choice).toBe('b');
      }
    });

    it('throws when all weights are zero or array is empty', () => {
      const rng = new SeededRng('weighted-empty');
      expect(() => rng.weightedPick([])).toThrow();
      expect(() =>
        rng.weightedPick([
          { value: 'a', weight: 0 },
          { value: 'b', weight: 0 },
        ])
      ).toThrow();
    });
  });

  describe('sampleDistinct', () => {
    it('returns N unique entries from the source pool', () => {
      const rng = new SeededRng('sample-distinct');
      const pool = ['a', 'b', 'c', 'd', 'e'];
      const sample = rng.sampleDistinct(pool, 3);
      expect(sample).toHaveLength(3);
      expect(new Set(sample).size).toBe(3);
      for (const item of sample) expect(pool).toContain(item);
    });

    it('returns the whole pool when N >= pool length', () => {
      const rng = new SeededRng('sample-all');
      const pool = ['a', 'b'];
      const sample = rng.sampleDistinct(pool, 5);
      expect(new Set(sample)).toEqual(new Set(pool));
    });

    it('returns [] for N <= 0', () => {
      const rng = new SeededRng('sample-zero');
      expect(rng.sampleDistinct(['a'], 0)).toEqual([]);
    });
  });

  describe('chance', () => {
    it('returns true roughly p of the time', () => {
      const rng = new SeededRng('chance');
      let trues = 0;
      const N = 5000;
      for (let i = 0; i < N; i++) if (rng.chance(0.3)) trues++;
      const p = trues / N;
      expect(p).toBeGreaterThan(0.25);
      expect(p).toBeLessThan(0.35);
    });

    it('returns false for p <= 0 and true for p >= 1', () => {
      const rng = new SeededRng('chance-edges');
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(-1)).toBe(false);
      expect(rng.chance(1)).toBe(true);
      expect(rng.chance(2)).toBe(true);
    });
  });

  describe('generateSeed', () => {
    it('produces a non-empty string each call', () => {
      const a = SeededRng.generateSeed();
      const b = SeededRng.generateSeed();
      expect(a).toMatch(/.+/);
      expect(b).toMatch(/.+/);
      expect(a).not.toEqual(b);
    });
  });
});
