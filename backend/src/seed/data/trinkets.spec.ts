import { trinkets } from './trinkets';

describe('Trinkets seed data', () => {
  it('has at least 100 entries (the d100 trinket table)', () => {
    expect(trinkets.length).toBeGreaterThanOrEqual(100);
  });

  it('every entry has a non-empty description and a source', () => {
    for (const t of trinkets) {
      expect(typeof t.description).toBe('string');
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.source).toBe('string');
      expect(['srd-5.0', 'curated']).toContain(t.source);
    }
  });

  it('has no duplicate descriptions', () => {
    const seen = new Set<string>();
    for (const t of trinkets) {
      expect(seen.has(t.description)).toBe(false);
      seen.add(t.description);
    }
  });
});
