import {
  npcLootTemplates,
  NPC_LOOT_CR_BUCKETS,
  NPC_LOOT_PROFESSIONS,
  NPC_LOOT_GENERIC_PROFESSION,
} from './npc-loot-templates';

describe('NPC loot templates seed data', () => {
  it('uses only the documented CR buckets', () => {
    for (const t of npcLootTemplates) {
      expect(NPC_LOOT_CR_BUCKETS).toContain(t.crBucket);
    }
  });

  it('has every entry shaped correctly', () => {
    for (const t of npcLootTemplates) {
      expect(typeof t.profession).toBe('string');
      expect(t.profession.length).toBeGreaterThan(0);
      expect(t.coinage).toEqual({
        gp: [expect.any(Number), expect.any(Number)],
        sp: [expect.any(Number), expect.any(Number)],
        cp: [expect.any(Number), expect.any(Number)],
      });
      for (const denom of ['gp', 'sp', 'cp'] as const) {
        const [min, max] = t.coinage[denom];
        expect(min).toBeGreaterThanOrEqual(0);
        expect(max).toBeGreaterThanOrEqual(min);
      }
      expect(Array.isArray(t.items)).toBe(true);
      for (const item of t.items) {
        expect(typeof item.itemName).toBe('string');
        expect(typeof item.weight).toBe('number');
        expect(item.weight).toBeGreaterThan(0);
        expect(item.qty).toEqual([expect.any(Number), expect.any(Number)]);
        expect(item.qty[0]).toBeGreaterThanOrEqual(1);
        expect(item.qty[1]).toBeGreaterThanOrEqual(item.qty[0]);
      }
    }
  });

  it('has no duplicate (profession, crBucket) tuples', () => {
    const seen = new Set<string>();
    for (const t of npcLootTemplates) {
      const id = `${t.profession}::${t.crBucket}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('covers each curated profession with at least one CR bucket', () => {
    for (const profession of NPC_LOOT_PROFESSIONS) {
      const matches = npcLootTemplates.filter(t => t.profession === profession);
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it.each(NPC_LOOT_CR_BUCKETS)(
    'has a __generic__ fallback for CR bucket %s',
    crBucket => {
      const generic = npcLootTemplates.find(
        t => t.profession === NPC_LOOT_GENERIC_PROFESSION && t.crBucket === crBucket
      );
      expect(generic).toBeDefined();
    }
  );

  it('exports __generic__ as the documented sentinel', () => {
    expect(NPC_LOOT_GENERIC_PROFESSION).toBe('__generic__');
  });
});
