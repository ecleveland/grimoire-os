import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CampaignAuthService } from './campaign-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from '../test/fixtures';

describe('CampaignAuthService', () => {
  let service: CampaignAuthService;
  let prisma: MockPrismaService;

  const mockCampaign = {
    id: CAMPAIGN_ID,
    name: 'Test Campaign',
    ownerId: USER_ID,
    players: [
      { campaignId: CAMPAIGN_ID, userId: USER_ID },
    ],
    characters: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CampaignAuthService, prismaMockProvider()],
    }).compile();

    service = module.get<CampaignAuthService>(CampaignAuthService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assertCampaignOwner', () => {
    it('returns campaign when userId matches ownerId', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.assertCampaignOwner(CAMPAIGN_ID, USER_ID);

      expect(result).toEqual(mockCampaign);
      expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: CAMPAIGN_ID },
        include: { players: true, characters: true },
      });
    });

    it('throws ForbiddenException when userId does not match ownerId', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      await expect(service.assertCampaignOwner(CAMPAIGN_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when campaign does not exist', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.assertCampaignOwner('nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertCampaignMember', () => {
    it('returns campaign when userId matches ownerId', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.assertCampaignMember(CAMPAIGN_ID, USER_ID);

      expect(result).toEqual(mockCampaign);
    });

    it('returns campaign when userId is in players', async () => {
      const campaignWithPlayer = {
        ...mockCampaign,
        ownerId: 'someone-else',
        players: [{ campaignId: CAMPAIGN_ID, userId: USER_ID_2 }],
      };
      prisma.campaign.findUnique.mockResolvedValue(campaignWithPlayer);

      const result = await service.assertCampaignMember(CAMPAIGN_ID, USER_ID_2);

      expect(result).toEqual(campaignWithPlayer);
    });

    it('throws ForbiddenException when userId is neither owner nor player', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      await expect(service.assertCampaignMember(CAMPAIGN_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when campaign does not exist', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.assertCampaignMember('nonexistent', USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assertAuthorOrDm', () => {
    it('passes when userId equals authorId', () => {
      expect(() =>
        service.assertAuthorOrDm(USER_ID, 'some-dm-id', USER_ID),
      ).not.toThrow();
    });

    it('passes when userId equals campaignOwnerId', () => {
      expect(() =>
        service.assertAuthorOrDm('some-author-id', USER_ID, USER_ID),
      ).not.toThrow();
    });

    it('throws ForbiddenException when userId is neither author nor DM', () => {
      expect(() =>
        service.assertAuthorOrDm(USER_ID, 'some-dm-id', USER_ID_2),
      ).toThrow(ForbiddenException);
    });
  });

  describe('findCampaignOrFail', () => {
    it('returns campaign when found', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.findCampaignOrFail(CAMPAIGN_ID);

      expect(result).toEqual(mockCampaign);
    });

    it('throws NotFoundException when not found', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.findCampaignOrFail('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
