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

  it('every SRD monster type resolves to a canonical type or falls back cleanly', () => {
    const raw = JSON.parse(fs.readFileSync(monstersJsonPath, 'utf-8')) as {
      monsters: { name: string; type: string; challenge_rating: string }[];
    };
    const select = createMonsterLootTemplateSelector(asLootTemplates());
    const fractions: Record<string, number> = { '1/8': 0.125, '1/4': 0.25, '1/2': 0.5 };
    for (const m of raw.monsters) {
      const cr = fractions[m.challenge_rating] ?? parseFloat(m.challenge_rating);
      const { selectionKey, crBucket } = monsterToLootSelection({
        type: m.type,
        challengeRating: cr,
      });
      const tpl = select(selectionKey, crBucket);
      expect(tpl).not.toBeNull();
    }
  });

  it('every SRD monster type normalizes to a canonical type (no silent generic-only fallbacks)', () => {
    const raw = JSON.parse(fs.readFileSync(monstersJsonPath, 'utf-8')) as {
      monsters: { type: string }[];
    };
    const types = new Set(raw.monsters.map(m => normalizeMonsterType(m.type)));
    for (const t of types) {
      expect(MONSTER_LOOT_TYPES).toContain(t);
    }
  });
});
