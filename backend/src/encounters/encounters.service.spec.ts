import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { ContentAccessService } from '../srd/content-access.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from '../test/fixtures';
import { EncounterDto, EncounterListItemDto } from './dto/encounter-response.dto';
import { MonsterLootService } from '../loot/monster-loot.service';
import { SeededRng } from '../common/helpers/seeded-rng';
import type { GeneratedLoot } from '../loot/loot.types';

describe('EncountersService', () => {
  let service: EncountersService;
  let prisma: MockPrismaService;
  let campaignAuth: {
    assertCampaignOwner: jest.Mock;
    assertCampaignMember: jest.Mock;
    assertOwnerOnCampaign: jest.Mock;
    assertMemberOnCampaign: jest.Mock;
  };
  let rollForMonster: jest.Mock;
  let monsterLoot: { loadRoller: jest.Mock };

  const ENCOUNTER_ID = 'enc-1111-2222-3333-444444444444';
  const MONSTER_ID = 'mon-1111-2222-3333-444444444444';

  const mockCampaignOwned = {
    id: CAMPAIGN_ID,
    name: 'Test Campaign',
    ownerId: USER_ID,
    players: [
      {
        id: 'cp1',
        campaignId: CAMPAIGN_ID,
        userId: USER_ID,
        joinedAt: new Date(),
      },
      {
        id: 'cp2',
        campaignId: CAMPAIGN_ID,
        userId: USER_ID_2,
        joinedAt: new Date(),
      },
    ],
    characters: [],
  };

  const mockEncounter = {
    id: ENCOUNTER_ID,
    campaignId: CAMPAIGN_ID,
    createdById: USER_ID,
    name: 'Goblin Ambush',
    combatants: [{ name: 'Goblin', initiative: 15, hp: 7, maxHp: 7, ac: 15, isNpc: true }],
    currentTurn: 0,
    round: 1,
    isActive: false,
    version: 0,
    createdAt: new Date('2025-02-01T00:00:00Z'),
    updatedAt: new Date('2025-02-01T00:00:00Z'),
  };

  // The detail DTO surfaces the Prisma `createdById` column as `createdBy`
  // (shared Encounter contract). Mirror that rename when asserting a DTO result
  // against a raw Prisma-entity mock.
  const asEncounterDto = <T extends { createdById?: string }>({ createdById, ...rest }: T) => ({
    ...rest,
    createdBy: createdById,
  });

  beforeEach(async () => {
    campaignAuth = {
      assertCampaignOwner: jest.fn(),
      assertCampaignMember: jest.fn(),
      assertOwnerOnCampaign: jest.fn(),
      assertMemberOnCampaign: jest.fn(),
    };

    rollForMonster = jest.fn();
    monsterLoot = { loadRoller: jest.fn().mockResolvedValue({ rollForMonster }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncountersService,
        ContentAccessService,
        prismaMockProvider(),
        { provide: CampaignAuthService, useValue: campaignAuth },
        { provide: MonsterLootService, useValue: monsterLoot },
      ],
    }).compile();

    service = module.get<EncountersService>(EncountersService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      campaignId: CAMPAIGN_ID,
      name: 'Goblin Ambush',
      combatants: [
        {
          name: 'Goblin',
          initiative: 15,
          hp: 7,
          maxHp: 7,
          ac: 15,
          isNpc: true,
        },
      ],
    };

    it('throws ForbiddenException when non-DM tries to create', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.create(USER_ID_2, createDto)).rejects.toThrow(ForbiddenException);
    });

    it('creates encounter with combatants as InputJsonValue', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaignOwned);
      prisma.encounter.create.mockResolvedValue(mockEncounter);

      const result = await service.create(USER_ID, createDto);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.encounter.create).toHaveBeenCalledWith({
        data: {
          campaignId: CAMPAIGN_ID,
          name: 'Goblin Ambush',
          createdById: USER_ID,
          combatants: createDto.combatants,
        },
      });
      expect(result).toEqual(asEncounterDto(mockEncounter));
      expect(result).toBeInstanceOf(EncounterDto);
    });

    it('persists a combatant carrying monsterId after validating the reference', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaignOwned);
      prisma.monster.findMany.mockResolvedValue([{ id: MONSTER_ID }]);
      const dtoWithMonster = {
        campaignId: CAMPAIGN_ID,
        name: 'Goblin Ambush',
        combatants: [
          {
            name: 'Goblin',
            initiative: 15,
            hp: 7,
            maxHp: 7,
            ac: 15,
            isNpc: true,
            monsterId: MONSTER_ID,
          },
        ],
      };
      const created = { ...mockEncounter, combatants: dtoWithMonster.combatants };
      prisma.encounter.create.mockResolvedValue(created);

      const result = await service.create(USER_ID, dtoWithMonster);

      // Reference validation is scoped to what the writer can see (VEG-293):
      // the global catalog plus their own homebrew.
      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [MONSTER_ID] },
          OR: [{ contentSource: { in: ['srd', 'shared'] } }, { createdById: USER_ID }],
        },
        select: { id: true },
      });
      expect(prisma.encounter.create).toHaveBeenCalledWith({
        data: {
          campaignId: CAMPAIGN_ID,
          name: 'Goblin Ambush',
          createdById: USER_ID,
          combatants: dtoWithMonster.combatants,
        },
      });
      expect(result).toEqual(asEncounterDto(created));
    });

    it('does not query monsters when no combatant carries a monsterId', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaignOwned);
      prisma.encounter.create.mockResolvedValue(mockEncounter);

      await service.create(USER_ID, createDto);

      expect(prisma.monster.findMany).not.toHaveBeenCalled();
    });

    it('rejects creation when a combatant references an unknown monsterId', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaignOwned);
      prisma.monster.findMany.mockResolvedValue([]); // reference not found
      const dto = {
        campaignId: CAMPAIGN_ID,
        name: 'Goblin Ambush',
        combatants: [{ name: 'Goblin', monsterId: 'does-not-exist' }],
      };

      await expect(service.create(USER_ID, dto as never)).rejects.toThrow(BadRequestException);
      expect(prisma.encounter.create).not.toHaveBeenCalled();
    });
  });

  describe('findAllForCampaign', () => {
    it('verifies membership and returns paginated encounters', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);
      prisma.encounter.findMany.mockResolvedValue([mockEncounter]);
      prisma.encounter.count.mockResolvedValue(1);

      const pagination = { page: 1, limit: 20 };
      const result = await service.findAllForCampaign(CAMPAIGN_ID, USER_ID, pagination);

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.encounter.findMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID },
        select: {
          id: true,
          campaignId: true,
          name: true,
          combatants: true,
          round: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [
          {
            id: mockEncounter.id,
            campaignId: mockEncounter.campaignId,
            name: mockEncounter.name,
            combatants: mockEncounter.combatants,
            round: mockEncounter.round,
            isActive: mockEncounter.isActive,
            createdAt: mockEncounter.createdAt,
            updatedAt: mockEncounter.updatedAt,
          },
        ],
        total: 1,
        page: 1,
        lastPage: 1,
      });
      expect(result.data[0]).toBeInstanceOf(EncounterListItemDto);
      // currentTurn / createdById never reach the list payload.
      expect((result.data[0] as unknown as Record<string, unknown>).createdById).toBeUndefined();
      expect((result.data[0] as unknown as Record<string, unknown>).currentTurn).toBeUndefined();
    });
  });

  describe('findOne', () => {
    const campaignAuthShape = {
      id: CAMPAIGN_ID,
      ownerId: USER_ID,
      players: [{ userId: USER_ID }, { userId: USER_ID_2 }],
    };

    it('returns encounter and verifies membership in a single query', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        ...mockEncounter,
        campaign: campaignAuthShape,
      });

      const result = await service.findOne(ENCOUNTER_ID, USER_ID);

      expect(prisma.encounter.findUnique).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
        include: {
          campaign: { select: { id: true, ownerId: true, players: { select: { userId: true } } } },
        },
      });
      expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
      expect(campaignAuth.assertMemberOnCampaign).toHaveBeenCalledWith(campaignAuthShape, USER_ID);
      // The DTO surfaces the owner as `createdBy` (the shared Encounter contract),
      // mapping the Prisma `createdById` column — the frontend's controller check
      // (`encounter.createdBy === user.userId`) depends on this name.
      const { createdById, ...rest } = mockEncounter;
      expect(result).toEqual({ ...rest, createdBy: createdById });
      expect((result as unknown as Record<string, unknown>).createdById).toBeUndefined();
      expect((result as { campaign?: unknown }).campaign).toBeUndefined();
    });

    it('throws NotFoundException when encounter does not exist', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id', USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const campaignAuthShape = {
      id: CAMPAIGN_ID,
      ownerId: USER_ID,
      players: [{ userId: USER_ID }, { userId: USER_ID_2 }],
    };

    it('DM can update encounter fields (single query joining campaign)', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: ENCOUNTER_ID,
        campaign: campaignAuthShape,
      });
      const updated = { ...mockEncounter, name: 'Dragon Fight' };
      prisma.encounter.update.mockResolvedValue(updated);

      const result = await service.update(ENCOUNTER_ID, USER_ID, { name: 'Dragon Fight' });

      expect(prisma.encounter.findUnique).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
        select: {
          id: true,
          combatants: true,
          campaign: { select: { id: true, ownerId: true, players: { select: { userId: true } } } },
        },
      });
      expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
      expect(campaignAuth.assertOwnerOnCampaign).toHaveBeenCalledWith(campaignAuthShape, USER_ID);
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
        data: { name: 'Dragon Fight' },
      });
      expect(result).toEqual(asEncounterDto(updated));
    });

    it('DM can update combatants as InputJsonValue', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: ENCOUNTER_ID,
        campaign: campaignAuthShape,
      });
      const newCombatants = [
        { name: 'Dragon', initiative: 20, hp: 200, maxHp: 200, ac: 19, isNpc: true },
      ];
      const updated = { ...mockEncounter, combatants: newCombatants };
      prisma.encounter.update.mockResolvedValue(updated);

      const result = await service.update(ENCOUNTER_ID, USER_ID, {
        combatants: newCombatants,
      } as any);

      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
        data: { combatants: newCombatants },
      });
      expect(result).toEqual(asEncounterDto(updated));
    });

    it('validates monsterId references when updating combatants', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: ENCOUNTER_ID,
        campaign: campaignAuthShape,
      });
      prisma.monster.findMany.mockResolvedValue([{ id: MONSTER_ID }]);
      const newCombatants = [
        {
          name: 'Dragon',
          initiative: 20,
          hp: 200,
          maxHp: 200,
          ac: 19,
          isNpc: true,
          monsterId: MONSTER_ID,
        },
      ];
      const updated = { ...mockEncounter, combatants: newCombatants };
      prisma.encounter.update.mockResolvedValue(updated);

      const result = await service.update(ENCOUNTER_ID, USER_ID, {
        combatants: newCombatants,
      } as never);

      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: [MONSTER_ID] },
          OR: [{ contentSource: { in: ['srd', 'shared'] } }, { createdById: USER_ID }],
        },
        select: { id: true },
      });
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
        data: { combatants: newCombatants },
      });
      expect(result).toEqual(asEncounterDto(updated));
    });

    it('grandfathers monsterIds already on the stored encounter (deleted homebrew must not block saves)', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: ENCOUNTER_ID,
        combatants: [{ name: 'Ghost Troll', monsterId: 'deleted-monster-id' }],
        campaign: campaignAuthShape,
      });
      const combatants = [
        { name: 'Ghost Troll', initiative: 9, monsterId: 'deleted-monster-id' },
        { name: 'Bandit', initiative: 12, isNpc: true },
      ];
      prisma.encounter.update.mockResolvedValue({ ...mockEncounter, combatants });

      await service.update(ENCOUNTER_ID, USER_ID, { combatants } as never);

      // The dangling id was already present, so no validation query runs and
      // the save succeeds.
      expect(prisma.monster.findMany).not.toHaveBeenCalled();
      expect(prisma.encounter.update).toHaveBeenCalled();
    });

    it('rejects update when a combatant references an unknown monsterId', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: ENCOUNTER_ID,
        campaign: campaignAuthShape,
      });
      prisma.monster.findMany.mockResolvedValue([]); // reference not found

      await expect(
        service.update(ENCOUNTER_ID, USER_ID, {
          combatants: [{ name: 'X', monsterId: 'nope' }],
        } as never)
      ).rejects.toThrow(BadRequestException);
      expect(prisma.encounter.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when encounter does not exist', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.update(ENCOUNTER_ID, USER_ID, { name: 'Renamed' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws ForbiddenException when non-DM tries to update', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: ENCOUNTER_ID,
        campaign: campaignAuthShape,
      });
      campaignAuth.assertOwnerOnCampaign.mockImplementation(() => {
        throw new ForbiddenException('Only the campaign owner can perform this action');
      });

      await expect(service.update(ENCOUNTER_ID, USER_ID_2, { name: 'Renamed' })).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('update with optimistic locking (expectedVersion)', () => {
    const campaignAuthShape = {
      id: CAMPAIGN_ID,
      ownerId: USER_ID,
      players: [{ userId: USER_ID }, { userId: USER_ID_2 }],
    };

    it('guards the write on expectedVersion, increments version, and returns the fresh row', async () => {
      prisma.encounter.findUnique
        .mockResolvedValueOnce({ id: ENCOUNTER_ID, campaign: campaignAuthShape }) // auth read
        .mockResolvedValueOnce({ ...mockEncounter, currentTurn: 1, version: 4 }); // re-fetch
      prisma.encounter.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.update(ENCOUNTER_ID, USER_ID, {
        currentTurn: 1,
        expectedVersion: 3,
      });

      expect(campaignAuth.assertOwnerOnCampaign).toHaveBeenCalledWith(campaignAuthShape, USER_ID);
      expect(prisma.encounter.updateMany).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID, version: 3 },
        data: { currentTurn: 1, version: { increment: 1 } },
      });
      expect(prisma.encounter.update).not.toHaveBeenCalled();
      expect(result.currentTurn).toBe(1);
      expect(result.version).toBe(4);
    });

    it('throws 409 ConflictException carrying currentVersion on a stale write', async () => {
      prisma.encounter.findUnique
        .mockResolvedValueOnce({ id: ENCOUNTER_ID, campaign: campaignAuthShape }) // auth read
        .mockResolvedValueOnce({ ...mockEncounter, version: 7 }); // current-version probe
      prisma.encounter.updateMany.mockResolvedValue({ count: 0 });

      const err = await service
        .update(ENCOUNTER_ID, USER_ID, { currentTurn: 1, expectedVersion: 3 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({ currentVersion: 7 });
    });

    it('throws NotFoundException when the row vanished mid-update', async () => {
      prisma.encounter.findUnique
        .mockResolvedValueOnce({ id: ENCOUNTER_ID, campaign: campaignAuthShape }) // auth read
        .mockResolvedValueOnce(null); // probe: gone
      prisma.encounter.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(ENCOUNTER_ID, USER_ID, { currentTurn: 1, expectedVersion: 3 })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rollLoot (VEG-300)', () => {
    const campaignAuthShape = {
      id: CAMPAIGN_ID,
      ownerId: USER_ID,
      players: [{ userId: USER_ID }, { userId: USER_ID_2 }],
    };
    const MONSTER_ID_2 = 'mon-5555-6666-7777-888888888888';

    const wolfRow = { id: MONSTER_ID, type: 'Beast', challengeRating: 0.25 };
    const dragonRow = { id: MONSTER_ID_2, type: 'Dragon (Chromatic)', challengeRating: 17 };

    const wolf = {
      name: 'Wolf',
      initiative: 12,
      hp: 11,
      maxHp: 11,
      ac: 13,
      isNpc: true,
      monsterId: MONSTER_ID,
    };
    const pc = { name: 'Aria (PC)', initiative: 18, hp: 30, maxHp: 30, ac: 16, isNpc: false };
    const dragon = {
      name: 'Red Dragon',
      initiative: 10,
      hp: 256,
      maxHp: 256,
      ac: 19,
      isNpc: true,
      monsterId: MONSTER_ID_2,
    };

    const generated = (over: Partial<GeneratedLoot> = {}): GeneratedLoot => ({
      template: { profession: 'beast', crBucket: '0–1' },
      coinage: { gp: 0, sp: 1, cp: 5 },
      items: [{ itemId: null, name: 'Wolf pelt', quantity: 1, source: 'monster' }],
      effective: {
        itemCountDie: '1d3',
        coinageMultiplier: 1,
        trinketChance: 0.05,
        magicItemChance: 0.005,
      },
      ...over,
    });

    const dragonLoot = generated({
      template: { profession: 'dragon', crBucket: '11+' },
      coinage: { gp: 500, sp: 0, cp: 0 },
      items: [{ itemId: 'item-gem', name: 'Ruby', quantity: 2, source: 'monster' }],
    });

    const mockEncounterRow = (combatants: unknown) => ({
      ...mockEncounter,
      combatants,
      campaign: campaignAuthShape,
    });

    beforeEach(() => {
      // Honor the `where.id.in` filter like real Prisma — rollLoot compares
      // the result count against the requested ids to detect stale references.
      prisma.monster.findMany.mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve([wolfRow, dragonRow].filter(m => where.id.in.includes(m.id)))
      );
      rollForMonster.mockImplementation((monster: { type: string }) =>
        monster.type.startsWith('Dragon') ? dragonLoot : generated()
      );
      // Unguarded write echoes back the data it was given, like Prisma does.
      prisma.encounter.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...mockEncounter, ...data })
      );
    });

    it('rolls loot for every monster combatant, skips manual ones, and returns the aggregate', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([wolf, pc, dragon]));

      const result = await service.rollLoot(ENCOUNTER_ID, USER_ID, {});

      expect(campaignAuth.assertOwnerOnCampaign).toHaveBeenCalledWith(campaignAuthShape, USER_ID);
      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: { id: { in: [MONSTER_ID, MONSTER_ID_2] } },
        select: { id: true, type: true, challengeRating: true },
      });
      expect(rollForMonster).toHaveBeenCalledTimes(2);
      expect(rollForMonster).toHaveBeenCalledWith(
        { type: 'Beast', challengeRating: 0.25 },
        expect.any(SeededRng)
      );
      expect(rollForMonster).toHaveBeenCalledWith(
        { type: 'Dragon (Chromatic)', challengeRating: 17 },
        expect.any(SeededRng)
      );

      const written = prisma.encounter.update.mock.calls[0][0].data.combatants;
      expect(written[0].loot).toEqual({
        coinage: { gp: 0, sp: 1, cp: 5 },
        items: [{ itemId: null, name: 'Wolf pelt', quantity: 1, source: 'monster' }],
        rolledAt: expect.any(String),
      });
      expect(written[1]).toEqual(pc); // manual combatant untouched
      expect(written[2].loot.coinage).toEqual({ gp: 500, sp: 0, cp: 0 });

      expect(result.encounter).toBeInstanceOf(EncounterDto);
      expect(result.lootTotal).toEqual({
        coinage: { gp: 500, sp: 1, cp: 5 },
        items: [
          { itemId: null, name: 'Wolf pelt', quantity: 1, source: 'monster' },
          { itemId: 'item-gem', name: 'Ruby', quantity: 2, source: 'monster' },
        ],
      });
    });

    it('rolls independently for combatants sharing the same monster (ids deduped in the query)', async () => {
      const wolfA = { ...wolf, name: 'Wolf A' };
      const wolfB = { ...wolf, name: 'Wolf B' };
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([wolfA, wolfB]));

      await service.rollLoot(ENCOUNTER_ID, USER_ID, { seed: 'pack' });

      // The lookup dedupes the shared id — without the dedup the count check
      // would spuriously 400 on the most common encounter shape.
      expect(prisma.monster.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: [MONSTER_ID] } } })
      );
      expect(rollForMonster).toHaveBeenCalledTimes(2);
      const written = prisma.encounter.update.mock.calls[0][0].data.combatants;
      expect(written[0].loot).toBeDefined();
      expect(written[1].loot).toBeDefined();
      // Distinct per-index rng streams despite the shared monster.
      const [, rngA] = rollForMonster.mock.calls[0];
      const [, rngB] = rollForMonster.mock.calls[1];
      expect((rngA as SeededRng).nextFloat()).toBe(new SeededRng('pack:0').nextFloat());
      expect((rngB as SeededRng).nextFloat()).toBe(new SeededRng('pack:1').nextFloat());
    });

    it('derives a deterministic per-combatant rng from the seed and combatant index', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([wolf, pc, dragon]));

      await service.rollLoot(ENCOUNTER_ID, USER_ID, { seed: 'veg-300' });

      const [, wolfRng] = rollForMonster.mock.calls[0];
      const [, dragonRng] = rollForMonster.mock.calls[1];
      // Same seed derivation → same float sequence. The dragon sits at
      // combatant index 2 (the manual PC at 1 is skipped but keeps its slot).
      expect((wolfRng as SeededRng).nextFloat()).toBe(new SeededRng('veg-300:0').nextFloat());
      expect((dragonRng as SeededRng).nextFloat()).toBe(new SeededRng('veg-300:2').nextFloat());
    });

    it('rolls only the selected combatant when combatantIndex is given', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([wolf, pc, dragon]));

      await service.rollLoot(ENCOUNTER_ID, USER_ID, { combatantIndex: 2 });

      expect(rollForMonster).toHaveBeenCalledTimes(1);
      expect(rollForMonster).toHaveBeenCalledWith(
        { type: 'Dragon (Chromatic)', challengeRating: 17 },
        expect.any(SeededRng)
      );
      const written = prisma.encounter.update.mock.calls[0][0].data.combatants;
      expect(written[0].loot).toBeUndefined();
      expect(written[2].loot).toBeDefined();
    });

    it('replaces existing loot on re-roll', async () => {
      const previouslyRolled = {
        ...wolf,
        loot: {
          coinage: { gp: 99, sp: 99, cp: 99 },
          items: [{ itemId: null, name: 'Old pelt', quantity: 9, source: 'monster' }],
          rolledAt: '2026-01-01T00:00:00.000Z',
        },
      };
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([previouslyRolled]));

      const result = await service.rollLoot(ENCOUNTER_ID, USER_ID, {});

      const written = prisma.encounter.update.mock.calls[0][0].data.combatants;
      expect(written[0].loot.coinage).toEqual({ gp: 0, sp: 1, cp: 5 });
      expect(written[0].loot.items).toEqual([
        { itemId: null, name: 'Wolf pelt', quantity: 1, source: 'monster' },
      ]);
      expect(result.lootTotal.coinage).toEqual({ gp: 0, sp: 1, cp: 5 });
    });

    it('throws 400 when combatantIndex is out of range', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([wolf]));

      await expect(service.rollLoot(ENCOUNTER_ID, USER_ID, { combatantIndex: 5 })).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.encounter.update).not.toHaveBeenCalled();
    });

    it('throws 400 when combatantIndex targets a combatant without a monsterId', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([wolf, pc]));

      await expect(service.rollLoot(ENCOUNTER_ID, USER_ID, { combatantIndex: 1 })).rejects.toThrow(
        BadRequestException
      );
    });

    it('throws 400 when no combatant references a monster (roll-all)', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([pc]));

      await expect(service.rollLoot(ENCOUNTER_ID, USER_ID, {})).rejects.toThrow(
        BadRequestException
      );
    });

    it('throws 400 when combatants is null (roll-all)', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow(null));

      await expect(service.rollLoot(ENCOUNTER_ID, USER_ID, {})).rejects.toThrow(
        BadRequestException
      );
    });

    it('roll-all skips combatants whose monster no longer exists instead of failing the whole roll', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([wolf, dragon]));
      // The wolf's monster was deleted (e.g. homebrew removed, VEG-293).
      prisma.monster.findMany.mockResolvedValue([dragonRow]);

      const result = await service.rollLoot(ENCOUNTER_ID, USER_ID, {});

      expect(rollForMonster).toHaveBeenCalledTimes(1);
      const [updatedWolf, updatedDragon] = result.encounter.combatants as Array<{
        loot?: unknown;
      }>;
      expect(updatedWolf.loot).toBeUndefined();
      expect(updatedDragon.loot).toBeDefined();
    });

    it('throws 400 when explicitly targeting a combatant whose monster no longer exists', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([wolf]));
      prisma.monster.findMany.mockResolvedValue([]);

      await expect(service.rollLoot(ENCOUNTER_ID, USER_ID, { combatantIndex: 0 })).rejects.toThrow(
        BadRequestException
      );
    });

    it('throws NotFoundException when the encounter does not exist', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.rollLoot(ENCOUNTER_ID, USER_ID, {})).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when a non-owner rolls', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounterRow([wolf]));
      campaignAuth.assertOwnerOnCampaign.mockImplementation(() => {
        throw new ForbiddenException('Only the campaign owner can perform this action');
      });

      await expect(service.rollLoot(ENCOUNTER_ID, USER_ID_2, {})).rejects.toThrow(
        ForbiddenException
      );
      expect(prisma.encounter.update).not.toHaveBeenCalled();
    });

    it('guards the write on expectedVersion and increments version', async () => {
      prisma.encounter.findUnique
        .mockResolvedValueOnce(mockEncounterRow([wolf])) // auth read
        .mockResolvedValueOnce({ ...mockEncounter, version: 4 }); // re-fetch
      prisma.encounter.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.rollLoot(ENCOUNTER_ID, USER_ID, { expectedVersion: 3 });

      expect(prisma.encounter.updateMany).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID, version: 3 },
        data: {
          combatants: expect.any(Array),
          version: { increment: 1 },
        },
      });
      expect(prisma.encounter.update).not.toHaveBeenCalled();
      expect(result.encounter.version).toBe(4);
    });

    it('throws 409 ConflictException carrying currentVersion on a stale roll', async () => {
      prisma.encounter.findUnique
        .mockResolvedValueOnce(mockEncounterRow([wolf])) // auth read
        .mockResolvedValueOnce({ ...mockEncounter, version: 7 }); // current-version probe
      prisma.encounter.updateMany.mockResolvedValue({ count: 0 });

      const err = await service
        .rollLoot(ENCOUNTER_ID, USER_ID, { expectedVersion: 3 })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toMatchObject({ currentVersion: 7 });
    });
  });

  describe('remove', () => {
    const campaignAuthShape = {
      id: CAMPAIGN_ID,
      ownerId: USER_ID,
      players: [{ userId: USER_ID }, { userId: USER_ID_2 }],
    };

    it('throws NotFoundException when encounter does not exist', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.remove(ENCOUNTER_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-DM tries to delete', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: ENCOUNTER_ID,
        campaign: campaignAuthShape,
      });
      campaignAuth.assertOwnerOnCampaign.mockImplementation(() => {
        throw new ForbiddenException('Only the campaign owner can perform this action');
      });

      await expect(service.remove(ENCOUNTER_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
    });

    it('DM can delete encounter (single query joining campaign)', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: ENCOUNTER_ID,
        campaign: campaignAuthShape,
      });
      prisma.encounter.delete.mockResolvedValue(mockEncounter);

      await service.remove(ENCOUNTER_ID, USER_ID);

      expect(prisma.encounter.findUnique).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
        select: {
          id: true,
          campaign: { select: { id: true, ownerId: true, players: { select: { userId: true } } } },
        },
      });
      expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
      expect(campaignAuth.assertOwnerOnCampaign).toHaveBeenCalledWith(campaignAuthShape, USER_ID);
      expect(prisma.encounter.delete).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
      });
    });
  });
});
