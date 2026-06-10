import * as fs from 'fs';
import * as path from 'path';
import { monsterLootTemplates } from './monster-loot-templates';
import { NPC_LOOT_CR_BUCKETS } from './npc-loot-templates';
import {
  MONSTER_LOOT_GENERIC_TYPE,
  MONSTER_LOOT_TYPES,
  createMonsterLootTemplateSelector,
  monsterToLootSelection,
  normalizeMonsterType,
} from '../../loot/monster-loot';
import { LootTemplate } from '../../loot/loot.types';

const asLootTemplates = (): LootTemplate[] =>
  monsterLootTemplates.map(t => ({
    key: t.type,
    crBucket: t.crBucket,
    coinage: t.coinage,
    items: t.items,
  }));

describe('Monster loot templates seed data', () => {
  it('uses only the documented CR buckets', () => {
    for (const t of monsterLootTemplates) {
      expect(NPC_LOOT_CR_BUCKETS).toContain(t.crBucket);
    }
  });

  it('keys every entry by a canonical type or the generic sentinel', () => {
    for (const t of monsterLootTemplates) {
      expect([...MONSTER_LOOT_TYPES, MONSTER_LOOT_GENERIC_TYPE]).toContain(t.type);
    }
  });

  it('has every entry shaped correctly', () => {
    for (const t of monsterLootTemplates) {
      expect(typeof t.type).toBe('string');
      expect(t.type.length).toBeGreaterThan(0);
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

  it('has no duplicate (type, crBucket) tuples', () => {
    const seen = new Set<string>();
    for (const t of monsterLootTemplates) {
      const id = `${t.type}::${t.crBucket}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('covers each canonical monster type with at least one bucket', () => {
    for (const type of MONSTER_LOOT_TYPES) {
      const matches = monsterLootTemplates.filter(t => t.type === type);
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it.each(NPC_LOOT_CR_BUCKETS)('has a generic monster fallback for CR bucket %s', crBucket => {
    const generic = monsterLootTemplates.find(
      t => t.type === MONSTER_LOOT_GENERIC_TYPE && t.crBucket === crBucket
    );
    expect(generic).toBeDefined();
  });

  it('gives beasts little or nothing: no gold and at most material items', () => {
    for (const t of monsterLootTemplates.filter(x => x.type === 'beast')) {
      expect(t.coinage.gp).toEqual([0, 0]);
      expect(t.coinage.sp[1]).toBeLessThanOrEqual(2);
    }
  });

  it('gives high-CR dragons a rich hoard', () => {
    const hoard = monsterLootTemplates.find(t => t.type === 'dragon' && t.crBucket === '11+');
    expect(hoard).toBeDefined();
    expect(hoard!.coinage.gp[0]).toBeGreaterThanOrEqual(100);
  });

  it('borrows humanoid gear from the NPC arsenal (recognizable weapon names)', () => {
    const humanoid = monsterLootTemplates.filter(t => t.type === 'humanoid');
    const names = humanoid.flatMap(t => t.items.map(i => i.itemName));
    expect(names).toEqual(expect.arrayContaining(['Dagger']));
  });
});

describe('Monster loot seed integrity against real SRD monsters', () => {
  const monstersJsonPath = path.resolve(
    __dirname,
    '../../../../docs/extracted-srd-json/monsters.json'
  );

  let srdMonsters: { name: string; type: string; challenge_rating: string }[];

  beforeAll(() => {
    const raw = JSON.parse(fs.readFileSync(monstersJsonPath, 'utf-8')) as {
      monsters: { name: string; type: string; challenge_rating: string }[];
    };
    srdMonsters = raw.monsters;
  });

  // Strict on purpose: an unrecognized CR string must fail the test, not get
  // parseFloat'd into the wrong bucket ('3/4' → 3) or NaN.
  const parseCr = (cr: string): number => {
    const fractions: Record<string, number> = { '1/8': 0.125, '1/4': 0.25, '1/2': 0.5 };
    if (cr in fractions) return fractions[cr];
    if (!/^\d+$/.test(cr)) throw new Error(`Unrecognized SRD challenge rating: "${cr}"`);
    return parseInt(cr, 10);
  };

  it('the SRD extraction is present and non-trivial', () => {
    // Guards against an empty/truncated monsters.json making the integrity
    // tests below pass vacuously.
    expect(srdMonsters.length).toBeGreaterThanOrEqual(300);
  });

  it('every SRD monster type resolves to a canonical type or falls back cleanly', () => {
    const select = createMonsterLootTemplateSelector(asLootTemplates());
    for (const m of srdMonsters) {
      const { selectionKey, crBucket } = monsterToLootSelection({
        type: m.type,
        challengeRating: parseCr(m.challenge_rating),
      });
      const tpl = select(selectionKey, crBucket);
      expect(tpl).not.toBeNull();
    }
  });

  it('every SRD monster type normalizes to a canonical type (no silent generic-only fallbacks)', () => {
    const types = new Set(srdMonsters.map(m => normalizeMonsterType(m.type)));
    for (const t of types) {
      expect(MONSTER_LOOT_TYPES).toContain(t);
    }
  });
});
