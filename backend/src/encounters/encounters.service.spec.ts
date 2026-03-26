import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from '../test/fixtures';

describe('EncountersService', () => {
  let service: EncountersService;
  let prisma: MockPrismaService;
  let campaignAuth: {
    assertCampaignOwner: jest.Mock;
    assertCampaignMember: jest.Mock;
  };

  const ENCOUNTER_ID = 'enc-1111-2222-3333-444444444444';

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
    createdAt: new Date('2025-02-01T00:00:00Z'),
    updatedAt: new Date('2025-02-01T00:00:00Z'),
  };

  beforeEach(async () => {
    campaignAuth = {
      assertCampaignOwner: jest.fn(),
      assertCampaignMember: jest.fn(),
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
      expect(result).toEqual(mockEncounter);
    });
  });

  describe('findAllForCampaign', () => {
    it('verifies membership and returns encounters', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);
      prisma.encounter.findMany.mockResolvedValue([mockEncounter]);

      const result = await service.findAllForCampaign(CAMPAIGN_ID, USER_ID);

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.encounter.findMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result).toEqual([mockEncounter]);
    });
  });

  describe('findOne', () => {
    it('returns encounter and verifies membership', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounter);
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);

      const result = await service.findOne(ENCOUNTER_ID, USER_ID);

      expect(prisma.encounter.findUnique).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
      });
      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(result).toEqual(mockEncounter);
    });

    it('throws NotFoundException when encounter does not exist', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id', USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('DM can update encounter fields', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounter);
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaignOwned);
      const updated = { ...mockEncounter, name: 'Dragon Fight' };
      prisma.encounter.update.mockResolvedValue(updated);

      const result = await service.update(ENCOUNTER_ID, USER_ID, { name: 'Dragon Fight' });

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
        data: { name: 'Dragon Fight' },
      });
      expect(result).toEqual(updated);
    });

    it('DM can update combatants as InputJsonValue', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounter);
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaignOwned);
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
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException when encounter does not exist', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.update(ENCOUNTER_ID, USER_ID, { name: 'Renamed' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws ForbiddenException when non-DM tries to update', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounter);
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.update(ENCOUNTER_ID, USER_ID_2, { name: 'Renamed' })).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when encounter does not exist', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(service.remove(ENCOUNTER_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when non-DM tries to delete', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounter);
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.remove(ENCOUNTER_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
    });

    it('DM can delete encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(mockEncounter);
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaignOwned);
      prisma.encounter.delete.mockResolvedValue(mockEncounter);

      await service.remove(ENCOUNTER_ID, USER_ID);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.encounter.delete).toHaveBeenCalledWith({
        where: { id: ENCOUNTER_ID },
      });
    });
  });
});
