import { Test, TestingModule } from '@nestjs/testing';
import { MonsterLootService } from './monster-loot.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { SeededRng } from '../common/helpers/seeded-rng';

describe('MonsterLootService', () => {
  let service: MonsterLootService;
  let prisma: MockPrismaService;

  const templateRow = (over: Record<string, unknown> = {}) => ({
    id: 'tpl-1',
    category: 'monster',
    profession: 'beast',
    crBucket: '0–1',
    coinage: { gp: [0, 0], sp: [0, 0], cp: [0, 0] },
    items: [],
    source: 'curated',
    isActive: true,
    ...over,
  });

  // Pins every stochastic knob so item assertions are exact: one template
  // item per roll, no trinkets, no magic items.
  const pinnedGameRules = [
    {
      id: 'gr1',
      category: 'npc-generation',
      key: 'item-count-die',
      value: '1d1',
      source: 'SRD 5.2.1',
    },
    {
      id: 'gr2',
      category: 'npc-generation',
      key: 'trinket-chance',
      value: 0,
      source: 'SRD 5.2.1',
    },
    {
      id: 'gr3',
      category: 'npc-generation',
      key: 'magic-item-chance-by-cr',
      value: { '0': 0, '0–1': 0, '2–4': 0, '5–10': 0, '11+': 0 },
      source: 'SRD 5.2.1',
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MonsterLootService, prismaMockProvider()],
    }).compile();

    service = module.get<MonsterLootService>(MonsterLootService);
    prisma = module.get<MockPrismaService>(PrismaService as never);

    prisma.npcLootTemplate.findMany.mockResolvedValue([templateRow()]);
    prisma.trinket.findMany.mockResolvedValue([]);
    prisma.item.findMany.mockResolvedValue([]);
    prisma.gameRule.findMany.mockResolvedValue(pinnedGameRules);
  });

  it('loads only active monster-category templates', async () => {
    await service.loadRoller();
    expect(prisma.npcLootTemplate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, category: 'monster' },
      })
    );
  });

  it('throws 422 when no active monster templates exist (unseeded database)', async () => {
    prisma.npcLootTemplate.findMany.mockResolvedValue([]);
    await expect(service.loadRoller()).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('seed'),
    });
  });

  it('falls back to the poorest available bucket for a type missing its derived bucket', async () => {
    // Rows arrive in lexicographic crBucket order — exactly what a DB
    // `orderBy crBucket asc` would produce ('11+' sorts before '2–4').
    prisma.npcLootTemplate.findMany.mockResolvedValue([
      templateRow({
        id: 'g11',
        profession: 'giant',
        crBucket: '11+',
        coinage: { gp: [300, 300], sp: [0, 0], cp: [0, 0] },
      }),
      templateRow({
        id: 'g24',
        profession: 'giant',
        crBucket: '2–4',
        coinage: { gp: [2, 2], sp: [0, 0], cp: [0, 0] },
      }),
      templateRow({
        id: 'g510',
        profession: 'giant',
        crBucket: '5–10',
        coinage: { gp: [40, 40], sp: [0, 0], cp: [0, 0] },
      }),
    ]);
    const roller = await service.loadRoller();

    // CR 1 giant has no '0–1' template; the any-bucket fallback must pick
    // the poorest bucket ('2–4'), not the lexicographically-first '11+'.
    const result = roller.rollForMonster({ type: 'Giant', challengeRating: 1 }, new SeededRng('s'));
    expect(result.template).toEqual({ profession: 'giant', crBucket: '2–4' });
    expect(result.coinage.gp).toBe(2);
  });

  it('reads loot tuning from the shared npc-generation game-rule category', async () => {
    await service.loadRoller();
    expect(prisma.gameRule.findMany).toHaveBeenCalledWith({
      where: { category: 'npc-generation' },
    });
  });

  it('is deterministic for a given seed', async () => {
    prisma.npcLootTemplate.findMany.mockResolvedValue([
      templateRow({
        coinage: { gp: [0, 100], sp: [0, 100], cp: [0, 100] },
        items: [
          { itemName: 'Wolf pelt', weight: 1, qty: [1, 3] },
          { itemName: 'Bone trophy', weight: 1, qty: [1, 2] },
        ],
      }),
    ]);
    const roller = await service.loadRoller();
    const monster = { type: 'Beast', challengeRating: 0.5 };

    const a = roller.rollForMonster(monster, new SeededRng('veg-300'));
    const b = roller.rollForMonster(monster, new SeededRng('veg-300'));
    expect(a).toEqual(b);
  });

  it('selects the template by normalized type and derived CR bucket', async () => {
    prisma.npcLootTemplate.findMany.mockResolvedValue([
      templateRow({ id: 't1', profession: 'beast', crBucket: '0–1' }),
      templateRow({
        id: 't2',
        profession: 'dragon',
        crBucket: '11+',
        coinage: { gp: [500, 500], sp: [0, 0], cp: [0, 0] },
      }),
    ]);
    const roller = await service.loadRoller();

    const dragon = roller.rollForMonster(
      { type: 'Dragon (Chromatic)', challengeRating: 17 },
      new SeededRng('s')
    );
    expect(dragon.template).toEqual({ profession: 'dragon', crBucket: '11+' });
    expect(dragon.coinage.gp).toBe(500);

    const beast = roller.rollForMonster({ type: 'Beast', challengeRating: 1 }, new SeededRng('s'));
    expect(beast.template).toEqual({ profession: 'beast', crBucket: '0–1' });
    expect(beast.coinage).toEqual({ gp: 0, sp: 0, cp: 0 });
  });

  it('tags template items with source=monster and resolves catalog item ids', async () => {
    prisma.npcLootTemplate.findMany.mockResolvedValue([
      templateRow({ items: [{ itemName: 'Dagger', weight: 1, qty: [2, 2] }] }),
    ]);
    prisma.item.findMany.mockResolvedValue([{ id: 'item-dagger', name: 'Dagger', isMagic: false }]);
    const roller = await service.loadRoller();

    const result = roller.rollForMonster({ type: 'Beast', challengeRating: 1 }, new SeededRng('s'));
    expect(result.items).toEqual([
      { itemId: 'item-dagger', name: 'Dagger', quantity: 2, source: 'monster' },
    ]);
  });

  it('falls back to engine defaults when no game rules are seeded', async () => {
    prisma.gameRule.findMany.mockResolvedValue([]);
    prisma.npcLootTemplate.findMany.mockResolvedValue([templateRow()]);
    const roller = await service.loadRoller();

    // Defaults: itemCountDie 1d3, coinageMultiplier 1 — the roll completes
    // without seeded rules and reports the effective defaults it used.
    const result = roller.rollForMonster({ type: 'Beast', challengeRating: 1 }, new SeededRng('s'));
    expect(result.effective.itemCountDie).toBe('1d3');
    expect(result.effective.coinageMultiplier).toBe(1);
  });

  it('throws on a non-finite challenge rating instead of guessing a bucket', async () => {
    const roller = await service.loadRoller();
    expect(() =>
      roller.rollForMonster({ type: 'Beast', challengeRating: NaN }, new SeededRng('s'))
    ).toThrow(/invalid challenge rating/);
  });
});
