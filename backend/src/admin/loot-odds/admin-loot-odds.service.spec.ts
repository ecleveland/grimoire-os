import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminLootOddsService } from './admin-loot-odds.service';
import { DEFAULT_LOOT_GAME_RULES } from '../../loot/loot-game-rules';

const CATEGORY = 'npc-generation';

describe('AdminLootOddsService', () => {
  let service: AdminLootOddsService;
  let prisma: {
    gameRule: { findMany: jest.Mock; upsert: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      gameRule: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(args => Promise.resolve(args)),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminLootOddsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AdminLootOddsService>(AdminLootOddsService);
  });

  describe('get', () => {
    it('reads only the npc-generation rows and resolves them', async () => {
      prisma.gameRule.findMany.mockResolvedValue([
        { key: 'trinket-chance', value: 0.2 },
        { key: 'item-count-die', value: '2d6' },
      ]);

      const result = await service.get();

      expect(prisma.gameRule.findMany).toHaveBeenCalledWith({ where: { category: CATEGORY } });
      // Present rows win; absent rows fall back to the engine defaults.
      expect(result.trinketChance).toBe(0.2);
      expect(result.itemCountDie).toBe('2d6');
      expect(result.coinageMultiplier).toBe(DEFAULT_LOOT_GAME_RULES.coinageMultiplier);
      expect(result.magicItemChanceByCr).toEqual(DEFAULT_LOOT_GAME_RULES.magicItemChanceByCr);
    });

    it('falls back entirely to defaults when no rows exist', async () => {
      prisma.gameRule.findMany.mockResolvedValue([]);
      expect(await service.get()).toEqual(DEFAULT_LOOT_GAME_RULES);
    });

    it('round-trips a stored chance map, preserving the en-dash bucket keys', async () => {
      const map = { '0': 0.002, '0–1': 0.006, '2–4': 0.03, '5–10': 0.06, '11+': 0.2 };
      prisma.gameRule.findMany.mockResolvedValue([{ key: 'magic-item-chance-by-cr', value: map }]);
      expect((await service.get()).magicItemChanceByCr).toEqual(map);
    });
  });

  describe('update', () => {
    it('upserts each provided knob under its kebab-case key', async () => {
      const map = { '0': 0.001, '0–1': 0.005, '2–4': 0.02, '5–10': 0.05, '11+': 0.2 };
      await service.update({
        trinketChance: 0.1,
        magicItemChanceByCr: map,
        itemCountDie: '1d4',
        coinageMultiplier: 2,
      });

      const upsertedKeys = prisma.gameRule.upsert.mock.calls.map(c => c[0].where.category_key.key);
      expect(upsertedKeys).toEqual([
        'trinket-chance',
        'magic-item-chance-by-cr',
        'item-count-die',
        'coinage-multiplier',
      ]);

      const trinketCall = prisma.gameRule.upsert.mock.calls[0][0];
      expect(trinketCall).toEqual({
        where: { category_key: { category: CATEGORY, key: 'trinket-chance' } },
        create: { category: CATEGORY, key: 'trinket-chance', value: 0.1 },
        update: { value: 0.1 },
      });

      const mapCall = prisma.gameRule.upsert.mock.calls[1][0];
      expect(mapCall.update.value).toEqual(map);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('only upserts the knobs present in a partial payload', async () => {
      await service.update({ coinageMultiplier: 3 });

      expect(prisma.gameRule.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.gameRule.upsert.mock.calls[0][0].where.category_key.key).toBe(
        'coinage-multiplier'
      );
    });

    it('writes nothing for an empty payload but still returns resolved rules', async () => {
      const result = await service.update({});
      expect(prisma.gameRule.upsert).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result).toEqual(DEFAULT_LOOT_GAME_RULES);
    });

    it('returns the re-resolved rules after writing', async () => {
      prisma.gameRule.findMany.mockResolvedValue([{ key: 'coinage-multiplier', value: 3 }]);
      const result = await service.update({ coinageMultiplier: 3 });
      expect(result.coinageMultiplier).toBe(3);
    });
  });
});
