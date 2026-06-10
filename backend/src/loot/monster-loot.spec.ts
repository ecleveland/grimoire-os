import {
  MONSTER_LOOT_GENERIC_TYPE,
  createMonsterLootTemplateSelector,
  crToBucket,
  monsterToLootSelection,
  normalizeMonsterType,
} from './monster-loot';
import { LootRoller } from './loot-roller';
import { LootTemplate } from './loot.types';

const template = (over: Partial<LootTemplate> = {}): LootTemplate => ({
  key: 'dragon',
  crBucket: '11+',
  coinage: { gp: [100, 200], sp: [0, 0], cp: [0, 0] },
  items: [{ itemName: 'Gilded Goblet', weight: 1, qty: [1, 2] }],
  ...over,
});

describe('normalizeMonsterType', () => {
  it.each([
    ['Humanoid', 'humanoid'],
    ['Beast', 'beast'],
    ['Beast (Dinosaur)', 'beast'],
    ['Dragon (Chromatic)', 'dragon'],
    ['Dragon (Metallic)', 'dragon'],
    ['Fiend (Demon)', 'fiend'],
    ['Fiend (Devil)', 'fiend'],
    ['Humanoid (Cleric)', 'humanoid'],
    ['Undead (Wizard)', 'undead'],
    ['Monstrosity (Titan)', 'monstrosity'],
    ['Elemental (Genie)', 'elemental'],
    ['Celestial (Angel)', 'celestial'],
    ['Fey (Goblinoid)', 'fey'],
  ])('normalizes %s → %s', (raw, expected) => {
    expect(normalizeMonsterType(raw)).toBe(expected);
  });

  it('maps swarms to beast', () => {
    expect(normalizeMonsterType('Swarm of Tiny Beasts')).toBe('beast');
  });

  it('passes through unknown types lowercased (selector falls back to generic)', () => {
    expect(normalizeMonsterType('Weird Anomaly')).toBe('weird anomaly');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeMonsterType('  Undead  ')).toBe('undead');
  });
});

describe('crToBucket', () => {
  it.each([
    [0, '0'],
    [0.125, '0–1'],
    [0.25, '0–1'],
    [0.5, '0–1'],
    [1, '0–1'],
    [1.5, '2–4'],
    [2, '2–4'],
    [3, '2–4'],
    [4, '2–4'],
    [5, '5–10'],
    [8, '5–10'],
    [10, '5–10'],
    [11, '11+'],
    [17, '11+'],
    [30, '11+'],
  ])('CR %s → bucket %s', (cr, bucket) => {
    expect(crToBucket(cr)).toBe(bucket);
  });

  it('clamps negative CRs to the 0 bucket', () => {
    expect(crToBucket(-1)).toBe('0');
  });

  it('throws on non-finite CRs instead of silently picking a bucket', () => {
    expect(() => crToBucket(NaN)).toThrow(/invalid challenge rating/i);
    expect(() => crToBucket(Infinity)).toThrow(/invalid challenge rating/i);
  });
});

describe('monsterToLootSelection', () => {
  it('combines normalized type and derived CR bucket', () => {
    expect(monsterToLootSelection({ type: 'Dragon (Chromatic)', challengeRating: 17 })).toEqual({
      selectionKey: 'dragon',
      crBucket: '11+',
    });
  });

  it('handles a CR 0 swarm', () => {
    expect(monsterToLootSelection({ type: 'Swarm of Tiny Beasts', challengeRating: 0 })).toEqual({
      selectionKey: 'beast',
      crBucket: '0',
    });
  });
});

describe('createMonsterLootTemplateSelector', () => {
  const templates: LootTemplate[] = [
    template({ key: 'dragon', crBucket: '11+' }),
    template({ key: 'dragon', crBucket: '2–4', coinage: { gp: [5, 10], sp: [0, 0], cp: [0, 0] } }),
    template({ key: MONSTER_LOOT_GENERIC_TYPE, crBucket: '0–1' }),
    template({ key: MONSTER_LOOT_GENERIC_TYPE, crBucket: '11+' }),
  ];
  const select = createMonsterLootTemplateSelector(templates);

  it('prefers the exact type + bucket match', () => {
    expect(select('dragon', '11+')).toBe(templates[0]);
  });

  it('falls back to any bucket for the type', () => {
    expect(select('dragon', '0')).toBe(templates[0]);
  });

  it('falls back to the generic monster template for the bucket', () => {
    expect(select('ooze', '0–1')).toBe(templates[2]);
  });

  it('falls back to any generic monster template when the bucket has none', () => {
    expect(select('ooze', '2–4')).toBe(templates[2]);
  });

  it('returns null with no templates at all', () => {
    expect(createMonsterLootTemplateSelector([])('dragon', '11+')).toBeNull();
  });
});

describe('integration with the shared LootRoller', () => {
  it('rolls deterministic monster loot via the monster selector', () => {
    const roller = new LootRoller({
      selectTemplate: createMonsterLootTemplateSelector([template()]),
      trinkets: [],
      itemsByName: new Map(),
      magicItems: [],
      gameRules: {
        trinketChance: 0,
        magicItemChanceByCr: {},
        itemCountDie: '1d3',
        coinageMultiplier: 1,
      },
    });
    const { selectionKey, crBucket } = monsterToLootSelection({
      type: 'Dragon (Chromatic)',
      challengeRating: 17,
    });
    const a = roller.rollLoot({ selectionKey, crBucket, seed: 'dragon-1' });
    const b = roller.rollLoot({ selectionKey, crBucket, seed: 'dragon-1' });
    expect(a).toEqual(b);
    expect(a.template).toEqual({ profession: 'dragon', crBucket: '11+' });
    expect(a.coinage.gp).toBeGreaterThanOrEqual(100);
    expect(a.coinage.gp).toBeLessThanOrEqual(200);
  });
});
