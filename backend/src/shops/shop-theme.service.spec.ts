import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ShopThemeService, resolveSuggestions, type SuggestionItemRow } from './shop-theme.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import {
  SHOP_SUGGESTION_CAP,
  SHOP_SUGGESTION_PER_CATEGORY,
  type ShopThemePreset,
} from './data/shop-theme-presets';

describe('ShopThemeService', () => {
  let service: ShopThemeService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShopThemeService, prismaMockProvider()],
    }).compile();

    service = module.get(ShopThemeService);
    prisma = module.get<MockPrismaService>(PrismaService as unknown as new () => MockPrismaService);
  });

  describe('suggestStock', () => {
    it('returns [] for an unknown theme without touching the catalog', async () => {
      const result = await service.suggestStock('necromancer');
      expect(result).toEqual([]);
      expect(prisma.item.findMany).not.toHaveBeenCalled();
    });

    it('queries the catalog by the theme categories and pool names', async () => {
      prisma.item.findMany.mockResolvedValue([]);
      await service.suggestStock('alchemist');

      expect(prisma.item.findMany).toHaveBeenCalledTimes(1);
      const arg = prisma.item.findMany.mock.calls[0][0];
      expect(arg.where.OR).toEqual([
        { category: { in: ['Potion'] } },
        { name: { in: expect.arrayContaining(['Acid', 'Antitoxin']) } },
      ]);
      expect(arg.select).toMatchObject({ id: true, name: true, category: true, cost: true });
    });

    it('queries names-only themes without a category clause', async () => {
      prisma.item.findMany.mockResolvedValue([
        { id: 'b', name: 'Bread (loaf)', category: 'Food, Drink, or Lodging', cost: '2 CP' },
      ]);
      await service.suggestStock('baker');

      const arg = prisma.item.findMany.mock.calls[0][0];
      expect(arg.where.OR).toEqual([{ name: { in: ['Bread (loaf)', 'Rations'] } }]);
    });

    it('warns server-side when a known theme matches no catalog items (unseeded/drift)', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      prisma.item.findMany.mockResolvedValue([]);

      const result = await service.suggestStock('alchemist');
      expect(result).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('alchemist'));
      warn.mockRestore();
    });

    it('maps catalog rows to editable line items with default prices and unlimited stock', async () => {
      prisma.item.findMany.mockResolvedValue([
        { id: 'i1', name: 'Potion of Healing', category: 'Potion', cost: '50 GP' },
        { id: 'i2', name: 'Acid', category: 'Adventuring Gear', cost: '25 GP' },
      ]);

      const result = await service.suggestStock('alchemist');

      // Acid is a pool item → comes first; both map with parsed prices, stock null.
      expect(result).toEqual([
        {
          itemId: 'i2',
          name: 'Acid',
          category: 'Adventuring Gear',
          price: { cp: 0, sp: 0, ep: 0, gp: 25, pp: 0 },
          stock: null,
        },
        {
          itemId: 'i1',
          name: 'Potion of Healing',
          category: 'Potion',
          price: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 },
          stock: null,
        },
      ]);
    });

    it('falls back to a free (all-zero) price for non-fixed or missing costs', async () => {
      prisma.item.findMany.mockResolvedValue([
        { id: 'm1', name: 'Bag of Holding', category: 'Wondrous Item', cost: null },
        { id: 'm2', name: 'Spell Scroll', category: 'Scroll', cost: 'Varies' },
      ]);

      const result = await service.suggestStock('magic');
      expect(result.map(l => l.price)).toEqual([
        { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      ]);
    });
  });
});

describe('resolveSuggestions', () => {
  const row = (over: Partial<SuggestionItemRow>): SuggestionItemRow => ({
    id: 'id',
    name: 'name',
    category: 'Cat',
    cost: null,
    ...over,
  });

  it('skips curated pool names that do not resolve, keeping category items (drift-safe)', () => {
    const preset: ShopThemePreset = { categories: ['Potion'], itemNames: ['Nonexistent Item'] };
    const rows = [row({ id: 'p', name: 'Potion of Healing', category: 'Potion', cost: '50 GP' })];
    const result = resolveSuggestions(rows, preset);
    expect(result.map(l => l.name)).toEqual(['Potion of Healing']);
  });

  it('places curated pool items before category items', () => {
    const preset: ShopThemePreset = { categories: ['Weapon'], itemNames: ['Sword'] };
    const rows = [
      row({ id: 'a', name: 'Axe', category: 'Weapon' }),
      row({ id: 's', name: 'Sword', category: 'Weapon' }),
    ];
    const result = resolveSuggestions(rows, preset);
    expect(result.map(l => l.name)).toEqual(['Sword', 'Axe']);
  });

  it('caps category items per category but not pool items', () => {
    const preset: ShopThemePreset = { categories: ['Bulk'], itemNames: ['Star'] };
    const rows = [
      row({ id: 'star', name: 'Star', category: 'Bulk' }),
      ...Array.from({ length: SHOP_SUGGESTION_PER_CATEGORY + 5 }, (_, i) =>
        row({ id: `c${i}`, name: `Item ${i}`, category: 'Bulk' })
      ),
    ];
    const result = resolveSuggestions(rows, preset);
    const categoryCount = result.filter(l => l.name !== 'Star').length;
    expect(categoryCount).toBe(SHOP_SUGGESTION_PER_CATEGORY);
    expect(result[0].name).toBe('Star'); // pooled item survives, placed first
  });

  it('caps the total number of suggestions', () => {
    const preset: ShopThemePreset = {
      categories: Array.from({ length: 20 }, (_, i) => `Cat${i}`),
      itemNames: [],
    };
    const rows = Array.from({ length: 20 }, (_, c) =>
      Array.from({ length: SHOP_SUGGESTION_PER_CATEGORY }, (_, i) =>
        row({ id: `c${c}-${i}`, name: `n${c}-${i}`, category: `Cat${c}` })
      )
    ).flat();
    const result = resolveSuggestions(rows, preset);
    expect(result.length).toBe(SHOP_SUGGESTION_CAP);
  });
});
