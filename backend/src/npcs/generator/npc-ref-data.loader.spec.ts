import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { NpcRefDataLoader } from './npc-ref-data.loader';
import { createMockPrismaService, MockPrismaService } from '../../test/prisma-mock.factory';

describe('NpcRefDataLoader', () => {
  let loader: NpcRefDataLoader;
  let prisma: MockPrismaService;
  let warnSpy: jest.SpyInstance;

  afterEach(() => {
    warnSpy.mockRestore();
  });

  beforeEach(async () => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
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

  it('pins the item catalog to the global tiers so user homebrew never enters loot pools (VEG-296)', async () => {
    await loader.load();

    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contentSource: { in: ['srd', 'shared'] } },
      })
    );
  });

  it('pins the background pool to the global tiers so user homebrew never enters NPC generation (VEG-431)', async () => {
    await loader.load();

    expect(prisma.background.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contentSource: { in: ['srd', 'shared'] } },
      })
    );
  });

  it('selects the background id so personality resolution can be id-first (VEG-481)', async () => {
    await loader.load();

    expect(prisma.background.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ id: true }),
      })
    );
  });

  it('pins the monster pool to the global tiers so user homebrew never enters NPC generation (VEG-335)', async () => {
    await loader.load();

    expect(prisma.monster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { contentSource: { in: ['srd', 'shared'] } },
      })
    );
  });

  it('warns when the global monster catalog is empty — every NPC would silently generate statless', async () => {
    prisma.monster.findMany.mockResolvedValue([]);

    await loader.load();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/monster catalog is empty/i));
  });

  it('does not warn when the global catalog has monsters', async () => {
    prisma.monster.findMany.mockResolvedValue([{ name: 'Goblin', contentSource: 'srd' } as never]);

    await loader.load();

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/monster catalog is empty/i));
  });
});
