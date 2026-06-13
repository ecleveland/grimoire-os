import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  function baseRerollParams(): NpcGenerationParams {
    return {
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
  }

  function baseRerollNpc() {
    return {
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
      generationParams: baseRerollParams(),
      lockedFields: [],
      isManual: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  describe('reroll', () => {
    const baseNpc = baseRerollNpc();

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
      prisma.npc.update.mockImplementation(({ data }) => Promise.resolve({ ...baseNpc, ...data }));

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
      prisma.npc.update.mockImplementation(({ data }) => Promise.resolve({ ...baseNpc, ...data }));

      await service.reroll(NPC_ID, USER_ID, 'all');
      const callArgs = prisma.npc.update.mock.calls[0][0];
      // Locked fields preserved.
      expect(callArgs.data.race).toBe('Elf');
      expect(callArgs.data.name).toBe('Aelar Galanodel');
    });
  });

  describe('reroll lootOverrides contract (VEG-326)', () => {
    // Generation-time constraints carry stale overrides; the PATCH-able column
    // holds the DM's current edit. The column must win.
    const staleParams: NpcGenerationParams = {
      ...baseRerollParams(),
      constraints: {
        ...baseRerollParams().constraints,
        lootOverrides: { coinageMultiplier: 5 },
      },
    };
    const patchedNpc = {
      ...baseRerollNpc(),
      generationParams: staleParams,
      lootOverrides: { coinageMultiplier: 2 },
    };

    beforeEach(() => {
      prisma.npc.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...patchedNpc, ...data })
      );
    });

    it('a loot reroll uses the PATCHed column overrides, not stale constraints', async () => {
      prisma.npc.findUnique.mockResolvedValue(patchedNpc);

      await service.reroll(NPC_ID, USER_ID, 'loot');

      const data = prisma.npc.update.mock.calls[0][0].data;
      expect(data.lootOverrides).toEqual({ coinageMultiplier: 2 });
      expect(data.generationParams.constraints.lootOverrides).toEqual({ coinageMultiplier: 2 });
      expect(data.generationParams.decisions.loot.effective.coinageMultiplier).toBe(2);
    });

    it('a non-loot reroll no longer clobbers the PATCHed column with stale constraints', async () => {
      prisma.npc.findUnique.mockResolvedValue(patchedNpc);

      await service.reroll(NPC_ID, USER_ID, 'name');

      const data = prisma.npc.update.mock.calls[0][0].data;
      expect(data.lootOverrides).toEqual({ coinageMultiplier: 2 });
      expect(data.generationParams.constraints.lootOverrides).toEqual({ coinageMultiplier: 2 });
    });

    it('merges DTO overrides over saved ones and persists the merged constraints', async () => {
      prisma.npc.findUnique.mockResolvedValue(patchedNpc);

      await service.reroll(NPC_ID, USER_ID, 'loot', { trinketChance: 1 });

      const data = prisma.npc.update.mock.calls[0][0].data;
      expect(data.lootOverrides).toEqual({ coinageMultiplier: 2, trinketChance: 1 });
      expect(data.generationParams.constraints.lootOverrides).toEqual({
        coinageMultiplier: 2,
        trinketChance: 1,
      });
      const effective = data.generationParams.decisions.loot.effective;
      expect(effective.coinageMultiplier).toBe(2);
      expect(effective.trinketChance).toBe(1);
    });

    it('an explicit null clears saved overrides and rolls with base rules', async () => {
      prisma.npc.findUnique.mockResolvedValue(patchedNpc);

      await service.reroll(NPC_ID, USER_ID, 'loot', null);

      const data = prisma.npc.update.mock.calls[0][0].data;
      expect(data.lootOverrides).toEqual(Prisma.JsonNull);
      expect(data.generationParams.constraints.lootOverrides).toBeUndefined();
      // Fixture base rules: coinageMultiplier 1, trinketChance 0.05.
      const effective = data.generationParams.decisions.loot.effective;
      expect(effective.coinageMultiplier).toBe(1);
      expect(effective.trinketChance).toBe(0.05);
    });

    it('a cleared column wins over stale constraints (PATCH lootOverrides: null)', async () => {
      prisma.npc.findUnique.mockResolvedValue({
        ...patchedNpc,
        lootOverrides: null,
      });

      await service.reroll(NPC_ID, USER_ID, 'loot');

      const data = prisma.npc.update.mock.calls[0][0].data;
      expect(data.lootOverrides).toEqual(Prisma.JsonNull);
      expect(data.generationParams.constraints.lootOverrides).toBeUndefined();
      expect(data.generationParams.decisions.loot.effective.coinageMultiplier).toBe(1);
    });

    it('rejects lootOverrides when the loot field is locked', async () => {
      prisma.npc.findUnique.mockResolvedValue({
        ...patchedNpc,
        lockedFields: ['loot'],
      });

      await expect(service.reroll(NPC_ID, USER_ID, 'loot', { trinketChance: 1 })).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.npc.update).not.toHaveBeenCalled();
    });

    it('drops unknown keys from the saved column when merging into constraints', async () => {
      prisma.npc.findUnique.mockResolvedValue({
        ...patchedNpc,
        // e.g. persisted via the loosely-typed PATCH path before validation tightened
        lootOverrides: { coinageMultiplier: 2, junk: 99 },
      });

      await service.reroll(NPC_ID, USER_ID, 'loot');

      const data = prisma.npc.update.mock.calls[0][0].data;
      expect(data.generationParams.constraints.lootOverrides).toEqual({ coinageMultiplier: 2 });
      expect(data.lootOverrides).toEqual({ coinageMultiplier: 2 });
    });

    it('rejects lootOverrides on a non-loot reroll', async () => {
      prisma.npc.findUnique.mockResolvedValue(patchedNpc);

      await expect(service.reroll(NPC_ID, USER_ID, 'name', { trinketChance: 1 })).rejects.toThrow(
        BadRequestException
      );
      await expect(service.reroll(NPC_ID, USER_ID, 'all', null)).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.npc.update).not.toHaveBeenCalled();
    });
  });
});
