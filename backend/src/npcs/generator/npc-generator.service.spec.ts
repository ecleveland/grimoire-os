import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NpcGeneratorService } from './npc-generator.service';
import { CampaignAuthService } from '../../auth/campaign-auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NpcRefDataLoader } from './npc-ref-data.loader';
import { MockPrismaService, prismaMockProvider } from '../../test/prisma-mock.factory';
import { USER_ID, CAMPAIGN_ID } from '../../test/fixtures';
import { buildSeedRefData } from './npc-pipeline.fixture';
import { NpcGenerationParams } from './npc-generator.types';

describe('NpcGeneratorService', () => {
  let service: NpcGeneratorService;
  let prisma: MockPrismaService;
  let campaignAuth: { assertCampaignOwner: jest.Mock };
  let loader: { load: jest.Mock };

  const NPC_ID = 'npc-aaaa-bbbb-cccc-dddddddddddd';

  beforeEach(async () => {
    campaignAuth = { assertCampaignOwner: jest.fn() };
    loader = { load: jest.fn().mockResolvedValue(buildSeedRefData()) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NpcGeneratorService,
        prismaMockProvider(),
        { provide: CampaignAuthService, useValue: campaignAuth },
        { provide: NpcRefDataLoader, useValue: loader },
      ],
    }).compile();

    service = module.get<NpcGeneratorService>(NpcGeneratorService);
    prisma = module.get<MockPrismaService>(PrismaService as unknown as new () => MockPrismaService);
  });

  describe('generate', () => {
    it('asserts campaign ownership before generating', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(new ForbiddenException('not owner'));
      await expect(service.generate(USER_ID, { campaignId: CAMPAIGN_ID })).rejects.toThrow(
        ForbiddenException
      );
    });

    it('returns a complete generated NPC payload without persisting', async () => {
      const npc = await service.generate(USER_ID, {
        campaignId: CAMPAIGN_ID,
        seed: 'svc-seed-1',
        race: 'Dwarf',
      });
      expect(npc.race).toBe('Dwarf');
      expect(npc.name.length).toBeGreaterThan(0);
      expect(npc.generationParams.seed).toBe('svc-seed-1');
      expect(prisma.npc.create).not.toHaveBeenCalled();
    });

    it('mints a fresh seed when none is provided', async () => {
      const a = await service.generate(USER_ID, { campaignId: CAMPAIGN_ID });
      const b = await service.generate(USER_ID, { campaignId: CAMPAIGN_ID });
      expect(a.generationParams.seed).not.toBe(b.generationParams.seed);
    });
  });

  describe('reroll', () => {
    const baseParams: NpcGenerationParams = {
      version: 1,
      seed: 'persisted-seed',
      constraints: { campaignId: CAMPAIGN_ID, race: 'Elf', background: 'Sage' },
      decisions: {
        race: 'Elf',
        background: 'Sage',
        profession: 'sage',
        alignment: 'Neutral Good',
        name: { full: 'Aelar Galanodel', first: 'Aelar', family: 'Galanodel', gender: 'male' },
        appearance: { prose: 'A elf...', parts: {} },
        personality: { traits: ['t'], ideals: ['i'], bonds: ['b'], flaws: ['f'] },
        loot: {
          template: { profession: 'sage', crBucket: '0' },
          coinage: { gp: 2, sp: 5, cp: 8 },
          items: [],
          effective: {
            itemCountDie: '1d3',
            coinageMultiplier: 1,
            trinketChance: 0.05,
            magicItemChance: 0,
          },
        },
      },
    };

    const baseNpc = {
      id: NPC_ID,
      campaignId: CAMPAIGN_ID,
      createdById: USER_ID,
      name: 'Aelar Galanodel',
      race: 'Elf',
      background: 'Sage',
      profession: 'sage',
      alignment: 'Neutral Good',
      size: 'Medium',
      age: 200,
      gender: 'male',
      appearance: 'A elf...',
      personalityTraits: ['t'],
      ideals: ['i'],
      bonds: ['b'],
      flaws: ['f'],
      statBlock: null,
      goldPieces: 2,
      silverPieces: 5,
      copperPieces: 8,
      loot: [],
      lootOverrides: null,
      generationParams: baseParams,
      lockedFields: [],
      isManual: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('throws when the NPC does not exist', async () => {
      prisma.npc.findUnique.mockResolvedValue(null);
      await expect(service.reroll(NPC_ID, USER_ID, 'name')).rejects.toThrow(NotFoundException);
    });

    it('throws when the NPC has no generationParams (manual creation)', async () => {
      prisma.npc.findUnique.mockResolvedValue({ ...baseNpc, generationParams: null });
      await expect(service.reroll(NPC_ID, USER_ID, 'name')).rejects.toThrow(NotFoundException);
    });

    it('asserts campaign ownership before rerolling', async () => {
      prisma.npc.findUnique.mockResolvedValue(baseNpc);
      campaignAuth.assertCampaignOwner.mockRejectedValue(new ForbiddenException());
      await expect(service.reroll(NPC_ID, USER_ID, 'name')).rejects.toThrow(ForbiddenException);
    });

    it('persists the rerolled NPC and returns the updated row', async () => {
      prisma.npc.findUnique.mockResolvedValue(baseNpc);
      prisma.npc.update.mockImplementation(async ({ data }) => ({ ...baseNpc, ...data }));

      const result = await service.reroll(NPC_ID, USER_ID, 'name');

      expect(prisma.npc.update).toHaveBeenCalledTimes(1);
      const callArgs = prisma.npc.update.mock.calls[0][0];
      expect(callArgs.where).toEqual({ id: NPC_ID });
      // Single-field reroll: race/background untouched, name regenerated.
      expect(callArgs.data.race).toBe('Elf');
      expect(callArgs.data.background).toBe('Sage');
      expect(callArgs.data.name).toBeDefined();
      expect(result).toBeDefined();
    });

    it('honors lockedFields when rerolling all', async () => {
      prisma.npc.findUnique.mockResolvedValue({
        ...baseNpc,
        lockedFields: ['race', 'name'],
      });
      prisma.npc.update.mockImplementation(async ({ data }) => ({ ...baseNpc, ...data }));

      await service.reroll(NPC_ID, USER_ID, 'all');
      const callArgs = prisma.npc.update.mock.calls[0][0];
      // Locked fields preserved.
      expect(callArgs.data.race).toBe('Elf');
      expect(callArgs.data.name).toBe('Aelar Galanodel');
    });
  });
});
