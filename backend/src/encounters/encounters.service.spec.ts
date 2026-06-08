import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from '../test/fixtures';
import { EncounterDto, EncounterListItemDto } from './dto/encounter-response.dto';

describe('EncountersService', () => {
  let service: EncountersService;
  let prisma: MockPrismaService;
  let campaignAuth: {
    assertCampaignOwner: jest.Mock;
    assertCampaignMember: jest.Mock;
    assertOwnerOnCampaign: jest.Mock;
    assertMemberOnCampaign: jest.Mock;
  };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncountersService,
        prismaMockProvider(),
        { provide: CampaignAuthService, useValue: campaignAuth },
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

      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: { id: { in: [MONSTER_ID] } },
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
        where: { id: { in: [MONSTER_ID] } },
        select: { id: true },
      });
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
        data: { combatants: newCombatants },
      });
      expect(result).toEqual(asEncounterDto(updated));
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
