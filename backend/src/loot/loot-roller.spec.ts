import { LootRoller } from './loot-roller';
import { createFallbackTemplateSelector, LootTemplateSelector } from './loot-template-selector';
import { GeneratedLoot, LootTemplate } from './loot.types';
import { NpcPipeline } from '../npcs/generator/npc-pipeline';
import { buildSeedRefData } from '../npcs/generator/npc-pipeline.fixture';
import { SeededRng } from '../common/helpers/seeded-rng';
import { NPC_LOOT_GENERIC_PROFESSION } from '../seed/data/npc-loot-templates';

// Builds a LootRoller from the same seed-data fixture the NPC pipeline tests
// use, with the NPC profession selection strategy.
function npcRoller(selectTemplate?: LootTemplateSelector) {
  const data = buildSeedRefData();
  const templates: LootTemplate[] = data.lootTemplates.map(t => ({
    key: t.profession,
    crBucket: t.crBucket,
    coinage: t.coinage,
    items: t.items,
  }));
  return new LootRoller({
    selectTemplate:
      selectTemplate ?? createFallbackTemplateSelector(templates, NPC_LOOT_GENERIC_PROFESSION),
    trinkets: data.trinkets,
    itemsByName: data.itemsByName,
    magicItems: data.magicItems,
    gameRules: data.gameRules,
  });
}

const template = (over: Partial<LootTemplate> = {}): LootTemplate => ({
  key: 'blacksmith',
  crBucket: '0',
  coinage: { gp: [1, 2], sp: [3, 4], cp: [5, 6] },
  items: [{ itemName: 'Hammer', weight: 1, qty: [1, 1] }],
  ...over,
});

describe('LootRoller — parity with NpcPipeline.pickLoot', () => {
  // The NPC pipeline rolls the CR bucket from the loot sub-RNG before rolling
  // the loot itself. Reproduce that exact consumption order here so the shared
  // roller sees the same RNG stream pickLoot used pre-extraction.
  it.each(['blacksmith', 'noble', 'mercenary', 'priest', 'peasant', 'astronaut'])(
    'reproduces NPC loot for profession=%s across seeds',
    profession => {
      const pipeline = new NpcPipeline(buildSeedRefData());
      for (const seed of ['seed-1', 'seed-2', 'seed-3', 'seed-4', 'seed-5']) {
        const fullSeed = `parity-${profession}-${seed}`;
        const expected = pipeline.pickLoot(
          new SeededRng(fullSeed),
          { campaignId: 'c1' },
          { profession }
        );
        const rng = new SeededRng(fullSeed);
        const crBucket = rng.weightedPick(
          // DEFAULT_CR_BUCKET_WEIGHTS, inlined to keep the consumption identical
          [
            { value: '0', weight: 60 },
            { value: '0–1', weight: 25 },
            { value: '2–4', weight: 10 },
            { value: '5–10', weight: 4 },
            { value: '11+', weight: 1 },
          ]
        );
        const actual = npcRoller().rollLoot({ selectionKey: profession, crBucket, rng });
        expect(actual).toEqual(expected);
      }
    }
  );

  it('reproduces NPC loot with overrides applied', () => {
    const pipeline = new NpcPipeline(buildSeedRefData());
    const overrides = {
      trinketChance: 1,
      magicItemChance: 1,
      itemCountDie: '2d4',
      coinageMultiplier: 3,
    };
    const expected = pipeline.pickLoot(
      new SeededRng('parity-overrides'),
      { campaignId: 'c1', lootOverrides: overrides },
      { profession: 'merchant' }
    );
    const rng = new SeededRng('parity-overrides');
    const crBucket = rng.weightedPick([
      { value: '0', weight: 60 },
      { value: '0–1', weight: 25 },
      { value: '2–4', weight: 10 },
      { value: '5–10', weight: 4 },
      { value: '11+', weight: 1 },
    ]);
    const actual = npcRoller().rollLoot({
      selectionKey: 'merchant',
      crBucket,
      overrides,
      rng,
    });
    expect(actual).toEqual(expected);
  });
});

describe('LootRoller — determinism', () => {
  it('same seed input produces identical results', () => {
    const a = npcRoller().rollLoot({ selectionKey: 'blacksmith', crBucket: '0', seed: 'det-1' });
    const b = npcRoller().rollLoot({ selectionKey: 'blacksmith', crBucket: '0', seed: 'det-1' });
    expect(a).toEqual(b);
  });

  it('seed input is equivalent to passing a fresh SeededRng for that seed', () => {
    const viaSeed = npcRoller().rollLoot({ selectionKey: 'hunter', crBucket: '0', seed: 'det-2' });
    const viaRng = npcRoller().rollLoot({
      selectionKey: 'hunter',
      crBucket: '0',
      rng: new SeededRng('det-2'),
    });
    expect(viaRng).toEqual(viaSeed);
  });

  it('different seeds produce different coinage eventually', () => {
    const rolls = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const loot = npcRoller().rollLoot({
        selectionKey: 'noble',
        crBucket: '0',
        seed: `det-3-${i}`,
      });
      rolls.add(JSON.stringify(loot.coinage));
    }
    expect(rolls.size).toBeGreaterThan(1);
  });

  it('throws when neither rng nor seed is provided', () => {
    expect(() => npcRoller().rollLoot({ selectionKey: 'noble', crBucket: '0' })).toThrow(
      /rng or seed/i
    );
  });
});

describe('LootRoller — pluggable template selection', () => {
  it('uses whatever template the injected strategy returns', () => {
    const custom = template({ key: 'dragon', crBucket: '11+', items: [] });
    const selector: LootTemplateSelector = () => custom;
    const loot = npcRoller(selector).rollLoot({
      selectionKey: 'anything',
      crBucket: '0',
      seed: 'strat-1',
      overrides: { trinketChance: 0, magicItemChance: 0 },
    });
    expect(loot.template).toEqual({ profession: 'dragon', crBucket: '11+' });
  });

  it('receives the selection key and CR bucket', () => {
    const seen: Array<[string | null, string]> = [];
    const selector: LootTemplateSelector = (key, bucket) => {
      seen.push([key, bucket]);
      return null;
    };
    npcRoller(selector).rollLoot({ selectionKey: 'guard', crBucket: '2–4', seed: 'strat-2' });
    expect(seen).toEqual([['guard', '2–4']]);
  });

  it('a null template yields zero coinage and no template-sourced items', () => {
    const selector: LootTemplateSelector = () => null;
    const loot = npcRoller(selector).rollLoot({
      selectionKey: 'guard',
      crBucket: '0',
      seed: 'strat-3',
      overrides: { trinketChance: 0, magicItemChance: 0 },
    });
    expect(loot.template).toBeNull();
    expect(loot.coinage).toEqual({ gp: 0, sp: 0, cp: 0 });
    expect(loot.items).toEqual([]);
  });
});

describe('createFallbackTemplateSelector — fallback chain', () => {
  const templates: LootTemplate[] = [
    template({ key: 'blacksmith', crBucket: '0' }),
    template({ key: 'blacksmith', crBucket: '2–4' }),
    template({ key: '__generic__', crBucket: '0' }),
    template({ key: '__generic__', crBucket: '5–10' }),
  ];
  const select = createFallbackTemplateSelector(templates, '__generic__');

  it('prefers the exact key + CR bucket match', () => {
    expect(select('blacksmith', '2–4')).toBe(templates[1]);
  });

  it('falls back to any CR bucket for the same key', () => {
    expect(select('blacksmith', '11+')).toBe(templates[0]);
  });

  it('falls back to the generic key for the requested bucket', () => {
    expect(select('astronaut', '0')).toBe(templates[2]);
  });

  it('falls back to any generic template when the bucket has none', () => {
    expect(select('astronaut', '11+')).toBe(templates[2]);
  });

  it('null key skips straight to the generic chain', () => {
    expect(select(null, '5–10')).toBe(templates[3]);
  });

  it('returns null when nothing matches', () => {
    const empty = createFallbackTemplateSelector([], '__generic__');
    expect(empty('blacksmith', '0')).toBeNull();
  });
});

describe('LootRoller — overrides and effective values', () => {
  it('records effective values from game rules when no overrides are given', () => {
    const loot = npcRoller().rollLoot({ selectionKey: 'farmer', crBucket: '2–4', seed: 'eff-1' });
    expect(loot.effective).toEqual({
      itemCountDie: '1d3',
      coinageMultiplier: 1,
      trinketChance: 0.05,
      magicItemChance: 0.02,
    });
  });

  it('overrides win over game rules and are recorded as effective', () => {
    const loot = npcRoller().rollLoot({
      selectionKey: 'farmer',
      crBucket: '2–4',
      seed: 'eff-2',
      overrides: { trinketChance: 0.42, coinageMultiplier: 3, itemCountDie: '3d3' },
    });
    expect(loot.effective).toEqual({
      itemCountDie: '3d3',
      coinageMultiplier: 3,
      trinketChance: 0.42,
      magicItemChance: 0.02,
    });
  });

  it('unknown CR bucket defaults magic item chance to 0', () => {
    const loot = npcRoller().rollLoot({
      selectionKey: 'farmer',
      crBucket: 'no-such-bucket',
      seed: 'eff-3',
    });
    expect(loot.effective.magicItemChance).toBe(0);
  });

  it('trinketChance=1 always adds a trinket item', () => {
    const loot = npcRoller().rollLoot({
      selectionKey: 'farmer',
      crBucket: '0',
      seed: 'eff-4',
      overrides: { trinketChance: 1, magicItemChance: 0 },
    });
    expect(loot.items.filter(i => i.source === 'trinket')).toHaveLength(1);
  });

  it('magicItemChance=1 always adds a magic item with its item id', () => {
    const loot = npcRoller().rollLoot({
      selectionKey: 'farmer',
      crBucket: '0',
      seed: 'eff-5',
      overrides: { trinketChance: 0, magicItemChance: 1 },
    });
    const magic = loot.items.filter(i => i.source === 'magic-item');
    expect(magic).toHaveLength(1);
    expect(magic[0].itemId).toMatch(/^magic-/);
  });

  it('coinageMultiplier scales coinage up on average', () => {
    let base = 0;
    let bumped = 0;
    for (let i = 0; i < 40; i++) {
      base += npcRoller().rollLoot({
        selectionKey: 'noble',
        crBucket: '0',
        seed: `mult-${i}`,
      }).coinage.gp;
      bumped += npcRoller().rollLoot({
        selectionKey: 'noble',
        crBucket: '0',
        seed: `mult-${i}`,
        overrides: { coinageMultiplier: 2 },
      }).coinage.gp;
    }
    expect(bumped).toBeGreaterThan(base);
  });

  it('itemCountDie override changes how many items are rolled', () => {
    let small = 0;
    let large = 0;
    for (let i = 0; i < 40; i++) {
      small += npcRoller().rollLoot({
        selectionKey: 'mercenary',
        crBucket: '0',
        seed: `die-${i}`,
      }).items.length;
      large += npcRoller().rollLoot({
        selectionKey: 'mercenary',
        crBucket: '0',
        seed: `die-${i}`,
        overrides: { itemCountDie: '3d3' },
      }).items.length;
    }
    expect(large).toBeGreaterThan(small);
  });

  it('resolves item ids from the item catalog and leaves unknown items null', () => {
    const tpl = template({
      items: [{ itemName: 'Not In Catalog', weight: 1, qty: [1, 1] }],
    });
    const roller = npcRoller(() => tpl);
    const loot: GeneratedLoot = roller.rollLoot({
      selectionKey: 'x',
      crBucket: '0',
      seed: 'ids-1',
      overrides: { trinketChance: 0, magicItemChance: 0, itemCountDie: '1d1' },
    });
    expect(loot.items).toHaveLength(1);
    expect(loot.items[0]).toMatchObject({
      itemId: null,
      name: 'Not In Catalog',
      quantity: 1,
      source: 'profession',
    });
  });
});
