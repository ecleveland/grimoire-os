import { Test, TestingModule } from '@nestjs/testing';
import { SrdService } from './srd.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MockPrismaService,
  prismaMockProvider,
} from '../test/prisma-mock.factory';

describe('SrdService', () => {
  let service: SrdService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SrdService, prismaMockProvider()],
    }).compile();

    service = module.get<SrdService>(SrdService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchSpells', () => {
    it('passes empty where when no filters provided', async () => {
      prisma.spell.findMany.mockResolvedValue([]);

      await service.searchSpells();

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: 'asc' },
      });
    });

    it('builds OR contains insensitive when query provided', async () => {
      prisma.spell.findMany.mockResolvedValue([]);

      await service.searchSpells('fire');

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'fire', mode: 'insensitive' } },
            { description: { contains: 'fire', mode: 'insensitive' } },
          ],
        },
        orderBy: { name: 'asc' },
      });
    });

    it('adds classes has filter when classFilter provided', async () => {
      prisma.spell.findMany.mockResolvedValue([]);

      await service.searchSpells(undefined, 'Wizard');

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {
          classes: { has: 'Wizard' },
        },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('searchMonsters', () => {
    it('applies parseFloat on cr filter', async () => {
      prisma.monster.findMany.mockResolvedValue([]);

      await service.searchMonsters(undefined, undefined, '0.25');

      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          challengeRating: 0.25,
        },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('searchItems', () => {
    it('adds category filter when provided', async () => {
      prisma.item.findMany.mockResolvedValue([]);

      await service.searchItems(undefined, 'Potion');

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          category: 'Potion',
        },
        orderBy: { name: 'asc' },
      });
    });
  });
});
