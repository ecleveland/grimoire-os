import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CHARACTER_ID, CAMPAIGN_ID } from '../test/fixtures';
import { CampaignStatus } from '../common/enums';
import { NoteVisibility } from '../prisma/enums';
import { CampaignDto, CampaignListItemDto } from './dto/campaign-response.dto';

jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(),
}));

import * as crypto from 'crypto';

describe('CampaignsService', () => {
  let service: CampaignsService;
  let prisma: MockPrismaService;
  let campaignAuth: {
    assertCampaignOwner: jest.Mock;
    assertCampaignMember: jest.Mock;
  };

  const mockCampaign = {
    id: CAMPAIGN_ID,
    name: 'Dragon Campaign',
    description: 'A test campaign',
    ownerId: USER_ID,
    status: CampaignStatus.ACTIVE,
    setting: null,
    currentSession: 1,
    inviteCode: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    players: [
      {
        id: 'cp1',
        campaignId: CAMPAIGN_ID,
        userId: USER_ID,
        joinedAt: new Date(),
      },
    ],
    characters: [],
  };

  const serializedMockCampaign = {
    id: CAMPAIGN_ID,
    name: 'Dragon Campaign',
    description: 'A test campaign',
    ownerId: USER_ID,
    status: CampaignStatus.ACTIVE,
    setting: null,
    currentSession: 1,
    inviteCode: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    playerIds: [USER_ID],
    characterIds: [],
  };

  beforeEach(async () => {
    campaignAuth = {
      assertCampaignOwner: jest.fn(),
      assertCampaignMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CampaignsService,
        prismaMockProvider(),
        { provide: CampaignAuthService, useValue: campaignAuth },
      ],
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
      expect(result).toEqual(serializedMockCampaign);
    });
  });

  describe('findAllForUser', () => {
    it('projects a slim list shape with playerIds, with pagination', async () => {
      const listRow = {
        id: CAMPAIGN_ID,
        name: 'Dragon Campaign',
        description: 'A test campaign',
        ownerId: USER_ID,
        status: CampaignStatus.ACTIVE,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-01-01T00:00:00Z'),
        players: [{ userId: USER_ID }],
      };
      prisma.campaign.findMany.mockResolvedValue([listRow]);
      prisma.campaign.count.mockResolvedValue(1);

      const result = await service.findAllForUser(USER_ID, { page: 1, limit: 20 });

      expect(prisma.campaign.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ ownerId: USER_ID }, { players: { some: { userId: USER_ID } } }],
        },
        select: {
          id: true,
          name: true,
          description: true,
          ownerId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          players: { select: { userId: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.campaign.count).toHaveBeenCalled();
      expect(result).toEqual({
        data: [
          {
            id: CAMPAIGN_ID,
            name: 'Dragon Campaign',
            description: 'A test campaign',
            ownerId: USER_ID,
            status: CampaignStatus.ACTIVE,
            createdAt: new Date('2025-01-01T00:00:00Z'),
            updatedAt: new Date('2025-01-01T00:00:00Z'),
            playerIds: [USER_ID],
          },
        ],
        total: 1,
        page: 1,
        lastPage: 1,
      });
      expect(result.data[0]).toBeInstanceOf(CampaignListItemDto);
    });
  });

  describe('findOne', () => {
    it('returns campaign when found', async () => {
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.findOne(CAMPAIGN_ID);

      expect(result).toEqual(serializedMockCampaign);
    });

    it('throws NotFoundException when not found', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('returns a CampaignDto and never leaks inviteCodeExpiresAt', async () => {
      prisma.campaign.findUnique.mockResolvedValue({
        ...mockCampaign,
        inviteCode: 'secret',
        inviteCodeExpiresAt: new Date('2025-03-01T00:00:00Z'),
      });

      const result = await service.findOne(CAMPAIGN_ID);

      expect(result).toBeInstanceOf(CampaignDto);
      expect(result.inviteCode).toBe('secret');
      expect((result as unknown as Record<string, unknown>).inviteCodeExpiresAt).toBeUndefined();
    });
  });

  describe('findOneForUser', () => {
    it('checks membership then fetches full campaign', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(undefined);
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);

      const result = await service.findOneForUser(CAMPAIGN_ID, USER_ID);

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.campaign.findUnique).toHaveBeenCalledWith({
        where: { id: CAMPAIGN_ID },
        include: { players: true, characters: true },
      });
      expect(result).toEqual(serializedMockCampaign);
    });

    it('throws ForbiddenException for non-member', async () => {
      campaignAuth.assertCampaignMember.mockRejectedValue(
        new ForbiddenException('You are not a member of this campaign')
      );

      await expect(service.findOneForUser(CAMPAIGN_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('update', () => {
    it('throws ForbiddenException for non-owner', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.update(CAMPAIGN_ID, USER_ID_2, { name: 'New Name' })).rejects.toThrow(
        ForbiddenException
      );
    });

    it('updates campaign when called by owner', async () => {
      const dto = { name: 'Updated Name', description: 'Updated desc' };
      const updatedCampaign = { ...mockCampaign, ...dto };
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaign);
      prisma.campaign.update.mockResolvedValue(updatedCampaign);

      const result = await service.update(CAMPAIGN_ID, USER_ID, dto);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: CAMPAIGN_ID },
        data: dto,
        include: { players: true, characters: true },
      });
      expect(result).toEqual({ ...serializedMockCampaign, ...dto });
    });
  });

  describe('generateInviteCode', () => {
    it('throws ForbiddenException for non-owner', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.generateInviteCode(CAMPAIGN_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('generates a 32-char hex code from crypto.randomBytes(16) and stores it with a 48h expiration', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaign);
      prisma.campaign.update.mockResolvedValue(mockCampaign);

      const hex32 = 'abcd1234'.repeat(4);
      const mockBuffer = Buffer.from(hex32, 'hex');
      (crypto.randomBytes as jest.Mock).mockReturnValue(mockBuffer);

      const before = Date.now();
      const code = await service.generateInviteCode(CAMPAIGN_ID, USER_ID);
      const after = Date.now();

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(crypto.randomBytes).toHaveBeenCalledWith(16);
      expect(code).toBe(hex32);
      expect(code).toHaveLength(32);

      const updateCall = prisma.campaign.update.mock.calls[0][0] as {
        where: { id: string };
        data: { inviteCode: string; inviteCodeExpiresAt: Date };
      };
      expect(updateCall.where).toEqual({ id: CAMPAIGN_ID });
      expect(updateCall.data.inviteCode).toBe(hex32);
      const expiresAt = updateCall.data.inviteCodeExpiresAt.getTime();
      const fortyEightHoursMs = 48 * 60 * 60 * 1000;
      expect(expiresAt).toBeGreaterThanOrEqual(before + fortyEightHoursMs);
      expect(expiresAt).toBeLessThanOrEqual(after + fortyEightHoursMs);
    });
  });

  describe('joinByInviteCode', () => {
    it('throws NotFoundException for invalid code', async () => {
      prisma.campaign.findUnique.mockResolvedValue(null);

      await expect(service.joinByInviteCode('badcode', USER_ID)).rejects.toThrow(NotFoundException);
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

    it('throws GoneException when the invite code has expired', async () => {
      const expiredCampaign = {
        ...mockCampaign,
        inviteCode: 'expiredcode',
        inviteCodeExpiresAt: new Date(Date.now() - 60_000),
      };
      prisma.campaign.findUnique.mockResolvedValueOnce(expiredCampaign);

      await expect(service.joinByInviteCode('expiredcode', USER_ID_2)).rejects.toThrow(
        GoneException
      );
      expect(prisma.campaignPlayer.upsert).not.toHaveBeenCalled();
    });

    it('accepts the code when inviteCodeExpiresAt is in the future', async () => {
      const futureCampaign = {
        ...mockCampaign,
        inviteCode: 'futurecode',
        inviteCodeExpiresAt: new Date(Date.now() + 60_000),
      };
      prisma.campaign.findUnique
        .mockResolvedValueOnce(futureCampaign)
        .mockResolvedValueOnce(futureCampaign);
      prisma.campaignPlayer.upsert.mockResolvedValue({});

      await service.joinByInviteCode('futurecode', USER_ID_2);

      expect(prisma.campaignPlayer.upsert).toHaveBeenCalled();
    });

    it('treats null inviteCodeExpiresAt as never-expires (legacy codes)', async () => {
      const legacyCampaign = {
        ...mockCampaign,
        inviteCode: 'legacycode',
        inviteCodeExpiresAt: null,
      };
      prisma.campaign.findUnique
        .mockResolvedValueOnce(legacyCampaign)
        .mockResolvedValueOnce(legacyCampaign);
      prisma.campaignPlayer.upsert.mockResolvedValue({});

      await service.joinByInviteCode('legacycode', USER_ID_2);

      expect(prisma.campaignPlayer.upsert).toHaveBeenCalled();
    });
  });

  describe('revokeInviteCode', () => {
    it('throws ForbiddenException for non-owner', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.revokeInviteCode(CAMPAIGN_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
      expect(prisma.campaign.update).not.toHaveBeenCalled();
    });

    it('clears both inviteCode and inviteCodeExpiresAt for owner', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaign);
      prisma.campaign.update.mockResolvedValue(mockCampaign);

      await service.revokeInviteCode(CAMPAIGN_ID, USER_ID);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.campaign.update).toHaveBeenCalledWith({
        where: { id: CAMPAIGN_ID },
        data: { inviteCode: null, inviteCodeExpiresAt: null },
      });
    });
  });

  describe('remove', () => {
    it('throws ForbiddenException for non-owner', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.remove(CAMPAIGN_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
    });

    it('deletes campaign when called by owner', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaign);
      prisma.campaign.delete.mockResolvedValue(mockCampaign);

      await service.remove(CAMPAIGN_ID, USER_ID);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.campaign.delete).toHaveBeenCalledWith({ where: { id: CAMPAIGN_ID } });
    });

    it('throws NotFoundException for nonexistent campaign', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new NotFoundException(`Campaign "nonexistent" not found`)
      );

      await expect(service.remove('nonexistent', USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('addCharacter', () => {
    it('adds character to campaign for a member who owns the character', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaign);
      prisma.character.findUnique.mockResolvedValue({ id: CHARACTER_ID, userId: USER_ID });
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign); // final findOne
      prisma.character.update.mockResolvedValue({ id: CHARACTER_ID, campaignId: CAMPAIGN_ID });

      const result = await service.addCharacter(CAMPAIGN_ID, CHARACTER_ID, USER_ID);

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        data: { campaignId: CAMPAIGN_ID },
      });
      expect(result).toEqual(serializedMockCampaign);
    });

    it('throws ForbiddenException for non-member', async () => {
      campaignAuth.assertCampaignMember.mockRejectedValue(
        new ForbiddenException('You are not a member of this campaign')
      );

      await expect(service.addCharacter(CAMPAIGN_ID, CHARACTER_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('throws NotFoundException when the character does not exist', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaign);
      prisma.character.findUnique.mockResolvedValue(null);

      await expect(service.addCharacter(CAMPAIGN_ID, CHARACTER_ID, USER_ID)).rejects.toThrow(
        NotFoundException
      );
      expect(prisma.character.update).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when a member adds another user's character", async () => {
      // mockCampaign.ownerId is USER_ID, so USER_ID_2 is a plain member here.
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaign);
      prisma.character.findUnique.mockResolvedValue({ id: CHARACTER_ID, userId: USER_ID });

      await expect(service.addCharacter(CAMPAIGN_ID, CHARACTER_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
      expect(prisma.character.update).not.toHaveBeenCalled();
    });

    it("allows the campaign owner to add a member's character", async () => {
      // USER_ID_2 is a member here (in players), so the owner may attach their character.
      const campaignWithMember = {
        ...mockCampaign,
        players: [
          ...mockCampaign.players,
          { id: 'cp2', campaignId: CAMPAIGN_ID, userId: USER_ID_2, joinedAt: new Date() },
        ],
      };
      campaignAuth.assertCampaignMember.mockResolvedValue(campaignWithMember);
      prisma.character.findUnique.mockResolvedValue({ id: CHARACTER_ID, userId: USER_ID_2 });
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign); // final findOne
      prisma.character.update.mockResolvedValue({ id: CHARACTER_ID, campaignId: CAMPAIGN_ID });

      const result = await service.addCharacter(CAMPAIGN_ID, CHARACTER_ID, USER_ID);

      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        data: { campaignId: CAMPAIGN_ID },
      });
      expect(result).toEqual(serializedMockCampaign);
    });

    it("rejects the owner attaching an outsider's character (not a campaign member)", async () => {
      // USER_ID_2 owns the character but is NOT in mockCampaign.players, so the
      // DM may not conscript it (would yank it out of its real campaign).
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaign);
      prisma.character.findUnique.mockResolvedValue({ id: CHARACTER_ID, userId: USER_ID_2 });

      await expect(service.addCharacter(CAMPAIGN_ID, CHARACTER_ID, USER_ID)).rejects.toThrow(
        ForbiddenException
      );
      expect(prisma.character.update).not.toHaveBeenCalled();
    });
  });

  describe('removeCharacter', () => {
    it('removes character from campaign when called by owner', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaign);
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign); // final findOne
      prisma.character.update.mockResolvedValue({ id: CHARACTER_ID, campaignId: null });

      const result = await service.removeCharacter(CAMPAIGN_ID, CHARACTER_ID, USER_ID);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.character.update).toHaveBeenCalledWith({
        where: { id: CHARACTER_ID },
        data: { campaignId: null },
      });
      expect(result).toEqual(serializedMockCampaign);
    });

    it('throws ForbiddenException for non-owner', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.removeCharacter(CAMPAIGN_ID, CHARACTER_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('removePlayer', () => {
    it('throws ForbiddenException for non-owner', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.removePlayer(CAMPAIGN_ID, 'some-player-id', USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('detaches the removed player characters, deletes their private notes, and deletes the join row in one transaction', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaign);
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign); // final findOne
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.note.deleteMany.mockResolvedValue({ count: 2 });
      prisma.campaignPlayer.delete.mockResolvedValue({});

      const result = await service.removePlayer(CAMPAIGN_ID, USER_ID_2, USER_ID);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);

      // All cleanup happens inside a single interactive transaction.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(typeof prisma.$transaction.mock.calls[0][0]).toBe('function');

      // 1. Characters are detached (campaignId -> null), not deleted.
      expect(prisma.character.updateMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID, userId: USER_ID_2 },
        data: { campaignId: null },
      });
      expect(prisma.character.deleteMany).not.toHaveBeenCalled();

      // 2. Only the player's PRIVATE notes are deleted; party notes are untouched.
      expect(prisma.note.deleteMany).toHaveBeenCalledWith({
        where: {
          campaignId: CAMPAIGN_ID,
          authorId: USER_ID_2,
          visibility: NoteVisibility.PRIVATE,
        },
      });

      // 4. The join row is deleted (existing behavior, now inside the transaction).
      expect(prisma.campaignPlayer.delete).toHaveBeenCalledWith({
        where: {
          campaignId_userId: { campaignId: CAMPAIGN_ID, userId: USER_ID_2 },
        },
      });

      expect(result).toEqual(serializedMockCampaign);
    });

    it('propagates the error and does not re-fetch the campaign when a cleanup step fails (rollback)', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaign);
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.note.deleteMany.mockResolvedValue({ count: 0 });
      prisma.campaignPlayer.delete.mockRejectedValue(new Error('db exploded'));

      await expect(service.removePlayer(CAMPAIGN_ID, USER_ID_2, USER_ID)).rejects.toThrow(
        'db exploded'
      );

      // The transaction rejected, so the final findOne never runs.
      expect(prisma.campaign.findUnique).not.toHaveBeenCalled();
    });
  });
});
