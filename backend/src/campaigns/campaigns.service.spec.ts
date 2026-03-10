import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  createMockPrismaService,
  MockPrismaService,
  prismaMockProvider,
} from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from '../test/fixtures';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(),
}));

import * as crypto from 'crypto';

describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: MockPrismaService;

  const mockCampaign = {
    id: CAMPAIGN_ID,
    name: 'Dragon Campaign',
    description: 'A test campaign',
    ownerId: USER_ID,
    status: 'active',
    setting: null,
    currentSession: 1,
    inviteCode: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    players: [{ id: 'cp1', campaignId: CAMPAIGN_ID, userId: USER_ID, joinedAt: new Date() }],
    characters: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CampaignsService, prismaMockProvider()],
    }).compile();

    service = module.get<CampaignsService>(CampaignsService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('creates campaign with ownerId and nested players create', async () => {
      const dto = { name: 'Dragon Campaign', description: 'A test campaign' };
      prisma.campaign.create.mockResolvedValue(mockCampaign);

      const result = await service.create(USER_ID, dto);

      expect(prisma.campaign.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          ownerId: USER_ID,
          players: { create: { userId: USER_ID } },
        },
        include: { players: true, characters: true },
      });
      expect(result).toEqual(mockCampaign);
    });
  });

  describe('findAllForUser', () => {
    it('uses OR condition with ownerId and players.some', async () => {
      prisma.campaign.findMany.mockResolvedValue([mockCampaign]);

      const result = await service.findAllForUser(USER_ID);

      expect(prisma.campaign.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { ownerId: USER_ID },
            { players: { some: { userId: USER_ID } } },
          ],
        },
        include: { players: true, characters: true },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result).toEqual([mockCampaign]);
    });
  });

  describe('findOne', () => {
    it('returns campaign when found', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.findOne(CAMPAIGN_ID);

      expect(result).toEqual(mockCampaign);
    });

    it('throws NotFoundException when not found', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOneForUser', () => {
    it('throws ForbiddenException for non-member', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      await expect(
        service.findOneForUser(CAMPAIGN_ID, USER_ID_2),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns campaign for owner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.findOneForUser(CAMPAIGN_ID, USER_ID);

      expect(result).toEqual(mockCampaign);
    });
  });

  describe('update', () => {
    it('throws ForbiddenException for non-owner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      await expect(
        service.update(CAMPAIGN_ID, USER_ID_2, { name: 'New Name' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('generateInviteCode', () => {
    it('throws ForbiddenException for non-owner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      await expect(
        service.generateInviteCode(CAMPAIGN_ID, USER_ID_2),
      ).rejects.toThrow(ForbiddenException);
    });

    it('generates code using crypto.randomBytes', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);
      prisma.campaign.update.mockResolvedValue(mockCampaign);

      const mockBuffer = Buffer.from('abcd1234', 'hex');
      (crypto.randomBytes as jest.Mock).mockReturnValue(mockBuffer);

      const code = await service.generateInviteCode(CAMPAIGN_ID, USER_ID);

      expect(crypto.randomBytes).toHaveBeenCalledWith(4);
      expect(code).toBe('abcd1234');
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: CAMPAIGN_ID },
        data: { inviteCode: 'abcd1234' },
      });
    });
  });

  describe('joinByInviteCode', () => {
    it('throws NotFoundException for invalid code', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(
        service.joinByInviteCode('badcode', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('calls campaignPlayer.upsert for valid code', async () => {
      const campaignWithCode = { ...mockCampaign, inviteCode: 'validcode' };
      // First call: findUnique by inviteCode; second call: findUnique by id (from findOne)
      prisma.campaign.findUnique
        .mockResolvedValueOnce(campaignWithCode)
        .mockResolvedValueOnce(campaignWithCode);
      prisma.campaignPlayer.upsert.mockResolvedValue({});

      await service.joinByInviteCode('validcode', USER_ID_2);

      expect(prisma.campaignPlayer.upsert).toHaveBeenCalledWith({
        where: {
          campaignId_userId: { campaignId: CAMPAIGN_ID, userId: USER_ID_2 },
        },
        create: { campaignId: CAMPAIGN_ID, userId: USER_ID_2 },
        update: {},
      });
    });
  });

  describe('removePlayer', () => {
    it('throws ForbiddenException for non-owner', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      await expect(
        service.removePlayer(CAMPAIGN_ID, 'some-player-id', USER_ID_2),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
