import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { NpcRefDataLoader } from './npc-ref-data.loader';
import { createMockPrismaService, MockPrismaService } from '../../test/prisma-mock.factory';

describe('NpcRefDataLoader', () => {
  let loader: NpcRefDataLoader;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    prisma = createMockPrismaService();
    prisma.race.findMany.mockResolvedValue([]);
    prisma.background.findMany.mockResolvedValue([]);
    prisma.npcAlignmentPrior.findMany.mockResolvedValue([]);
    prisma.npcNamePool.findMany.mockResolvedValue([]);
    prisma.npcAppearanceTrait.findMany.mockResolvedValue([]);
    prisma.npcLootTemplate.findMany.mockResolvedValue([]);
    prisma.trinket.findMany.mockResolvedValue([]);
    prisma.npcCustomPersonality.findMany.mockResolvedValue([]);
    prisma.item.findMany.mockResolvedValue([]);
    prisma.monster.findMany.mockResolvedValue([]);
    prisma.gameRule.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [NpcRefDataLoader, { provide: PrismaService, useValue: prisma }],
    }).compile();

    loader = module.get(NpcRefDataLoader);
  });

  it('loads only NPC-category loot templates (monster templates stay out of NPC generation)', async () => {
    await loader.load();

    expect(prisma.npcLootTemplate.findMany).toHaveBeenCalledWith({
      where: { isActive: true, category: 'npc' },
    });
  });
});
