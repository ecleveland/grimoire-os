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

  describe('findCharactersForMember', () => {
    // A full sheet row, including fields the roster must never expose.
    const fullCharacter = {
      id: CHARACTER_ID,
      userId: USER_ID_2,
      campaignId: CAMPAIGN_ID,
      name: 'Thia',
      race: 'Elf',
      class: 'Wizard',
      level: 5,
      armorClass: 12,
      initiative: 2,
      hitPoints: { max: 22, current: 17, temporary: 0 },
      abilityScores: { dexterity: 14 },
      backstory: 'a secret tragic past',
      inventory: [{ name: 'Spellbook' }],
      currency: { gp: 120 },
    };

    it('checks membership then returns the slim party-roster projection', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaign);
      prisma.character.findMany.mockResolvedValue([fullCharacter]);

      const result = await service.findCharactersForMember(CAMPAIGN_ID, USER_ID);

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      // The DB-level select is the projection — full sheets (large JSON blobs,
      // private fields) are never fetched, not merely dropped at the DTO layer.
      expect(prisma.character.findMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          userId: true,
          name: true,
          race: true,
          class: true,
          level: true,
          armorClass: true,
          initiative: true,
          hitPoints: true,
        },
      });
      expect(result).toEqual([
        {
          id: CHARACTER_ID,
          userId: USER_ID_2,
          name: 'Thia',
          race: 'Elf',
          class: 'Wizard',
          level: 5,
          armorClass: 12,
          initiative: 2,
          hitPoints: { max: 22, current: 17, temporary: 0 },
        },
      ]);
    });

    it('never leaks sheet fields beyond the roster projection', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaign);
      prisma.character.findMany.mockResolvedValue([fullCharacter]);

      const [roster] = await service.findCharactersForMember(CAMPAIGN_ID, USER_ID);

      expect(roster).not.toHaveProperty('backstory');
      expect(roster).not.toHaveProperty('inventory');
      expect(roster).not.toHaveProperty('currency');
      expect(roster).not.toHaveProperty('abilityScores');
    });

    it('propagates ForbiddenException for non-members without querying characters', async () => {
      campaignAuth.assertCampaignMember.mockRejectedValue(
        new ForbiddenException('You are not a member of this campaign')
      );

      await expect(service.findCharactersForMember(CAMPAIGN_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
      expect(prisma.character.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findAttachableCharacters', () => {
    // Owner is USER_ID; a separate player (USER_ID_2) is a member. The picker
    // should offer characters owned by either, but only the unattached ones.
    const ownerAndMemberCampaign = {
      ...mockCampaign,
      ownerId: USER_ID,
      players: [{ id: 'cp2', campaignId: CAMPAIGN_ID, userId: USER_ID_2, joinedAt: new Date() }],
    };

    const attachable = {
      id: CHARACTER_ID,
      userId: USER_ID_2,
      name: 'Borin',
      race: 'Dwarf',
      class: 'Fighter',
      level: 3,
      armorClass: 16,
      initiative: 1,
      hitPoints: { max: 28, current: 28, temporary: 0 },
      backstory: 'a closely guarded secret',
      inventory: [{ name: 'Battleaxe' }],
    };

    it("owner-gates, then lists members' unattached characters in the slim projection", async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(ownerAndMemberCampaign);
      prisma.character.findMany.mockResolvedValue([attachable]);

      const result = await service.findAttachableCharacters(CAMPAIGN_ID, USER_ID);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      // Filter: a campaign member's character (owner + players) that is not yet
      // attached to any campaign. Projection mirrors the roster's slim shape.
      expect(prisma.character.findMany).toHaveBeenCalledWith({
        where: { userId: { in: [USER_ID, USER_ID_2] }, campaignId: null },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          userId: true,
          name: true,
          race: true,
          class: true,
          level: true,
          armorClass: true,
          initiative: true,
          hitPoints: true,
        },
      });
      expect(result).toEqual([
        {
          id: CHARACTER_ID,
          userId: USER_ID_2,
          name: 'Borin',
          race: 'Dwarf',
          class: 'Fighter',
          level: 3,
          armorClass: 16,
          initiative: 1,
          hitPoints: { max: 28, current: 28, temporary: 0 },
        },
      ]);
    });

    it('never leaks sheet fields beyond the roster projection', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(ownerAndMemberCampaign);
      prisma.character.findMany.mockResolvedValue([attachable]);

      const [row] = await service.findAttachableCharacters(CAMPAIGN_ID, USER_ID);

      expect(row).not.toHaveProperty('backstory');
      expect(row).not.toHaveProperty('inventory');
    });

    it('propagates ForbiddenException for non-owners without querying characters', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.findAttachableCharacters(CAMPAIGN_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
      expect(prisma.character.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findMembers', () => {
    // Owner is USER_ID; USER_ID_2 is a joined player. The owner is also present
    // in the players relation (campaigns add the owner as a CampaignPlayer), so
    // the member list must de-dupe the owner rather than list them twice.
    const ownerAndMemberCampaign = {
      ...mockCampaign,
      ownerId: USER_ID,
      players: [
        { id: 'cp1', campaignId: CAMPAIGN_ID, userId: USER_ID, joinedAt: new Date() },
        { id: 'cp2', campaignId: CAMPAIGN_ID, userId: USER_ID_2, joinedAt: new Date() },
      ],
    };

    it('owner-gates, then lists the owner first and players sorted by displayName', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(ownerAndMemberCampaign);
      // Returned out of order to prove the service sorts players by displayName.
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID_2, displayName: 'Zara' },
        { id: USER_ID, displayName: 'Owner Olwen' },
      ]);

      const result = await service.findMembers(CAMPAIGN_ID, USER_ID);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { id: { in: [USER_ID, USER_ID_2] } },
        select: { id: true, displayName: true },
      });
      expect(result).toEqual([
        { userId: USER_ID, displayName: 'Owner Olwen', isOwner: true },
        { userId: USER_ID_2, displayName: 'Zara', isOwner: false },
      ]);
    });

    it('sorts multiple players by displayName, owner always first', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue({
        ...mockCampaign,
        ownerId: USER_ID,
        players: [
          { id: 'cp1', campaignId: CAMPAIGN_ID, userId: USER_ID, joinedAt: new Date() },
          { id: 'cp2', campaignId: CAMPAIGN_ID, userId: USER_ID_2, joinedAt: new Date() },
          { id: 'cp3', campaignId: CAMPAIGN_ID, userId: CHARACTER_ID, joinedAt: new Date() },
        ],
      });
      prisma.user.findMany.mockResolvedValue([
        { id: USER_ID, displayName: 'Owner' },
        { id: USER_ID_2, displayName: 'Brunhild' },
        { id: CHARACTER_ID, displayName: 'Aerin' },
      ]);

      const result = await service.findMembers(CAMPAIGN_ID, USER_ID);

      expect(result.map(m => m.displayName)).toEqual(['Owner', 'Aerin', 'Brunhild']);
      expect(result.map(m => m.isOwner)).toEqual([true, false, false]);
    });

    it("falls back to 'Unknown' for a member whose user row is missing (since-deleted)", async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(ownerAndMemberCampaign);
      // The player's user row is gone (account deleted) — findMany omits it, so
      // the display-name lookup misses and the row is still listed + removable.
      prisma.user.findMany.mockResolvedValue([{ id: USER_ID, displayName: 'Owner Olwen' }]);

      const result = await service.findMembers(CAMPAIGN_ID, USER_ID);

      expect(result).toEqual([
        { userId: USER_ID, displayName: 'Owner Olwen', isOwner: true },
        { userId: USER_ID_2, displayName: 'Unknown', isOwner: false },
      ]);
    });

    it('propagates ForbiddenException for non-owners without querying users', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.findMembers(CAMPAIGN_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
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
      prisma.character.findMany.mockResolvedValue([]); // no owned characters → no combatant cleanup
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

      // No owned characters → no encounters are inspected or rewritten.
      expect(prisma.encounter.findMany).not.toHaveBeenCalled();
      expect(prisma.encounter.update).not.toHaveBeenCalled();

      expect(result).toEqual(serializedMockCampaign);
    });

    it("strips the removed player's PC combatants from encounters that contain them, bumping version, and leaves others untouched (VEG-256)", async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaign);
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign); // final findOne
      // The player owns char-1; their combatant should be removed.
      prisma.character.findMany.mockResolvedValue([{ id: 'char-1' }]);
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.note.deleteMany.mockResolvedValue({ count: 0 });
      prisma.encounter.findMany.mockResolvedValue([
        {
          id: 'enc-with-pc',
          // currentTurn still valid after the strip (Goblin remains at index 0).
          currentTurn: 0,
          combatants: [
            { name: 'Aria', isNpc: false, characterId: 'char-1' },
            { name: 'Goblin', isNpc: true },
          ],
        },
        {
          // No combatant linked to the removed player → must NOT be rewritten.
          id: 'enc-without-pc',
          currentTurn: 0,
          combatants: [{ name: 'Bron', isNpc: false, characterId: 'char-other' }],
        },
      ]);
      prisma.encounter.update.mockResolvedValue({});
      prisma.campaignPlayer.delete.mockResolvedValue({});

      await service.removePlayer(CAMPAIGN_ID, USER_ID_2, USER_ID);

      expect(prisma.character.findMany).toHaveBeenCalledWith({
        where: { userId: USER_ID_2 },
        select: { id: true },
      });
      expect(prisma.encounter.findMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID },
        select: { id: true, combatants: true, currentTurn: true },
      });

      // Only the matching encounter is rewritten — trimmed array + version bump.
      // currentTurn stays in range here, so it isn't part of the write.
      expect(prisma.encounter.update).toHaveBeenCalledTimes(1);
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-with-pc' },
        data: {
          combatants: [{ name: 'Goblin', isNpc: true }],
          version: { increment: 1 },
        },
      });
    });

    it('clamps currentTurn when stripping a combatant pushes it past the end of the list (VEG-256)', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaign);
      prisma.campaign.findUnique.mockResolvedValue(mockCampaign);
      prisma.character.findMany.mockResolvedValue([{ id: 'char-1' }]);
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.note.deleteMany.mockResolvedValue({ count: 0 });
      prisma.encounter.findMany.mockResolvedValue([
        {
          id: 'enc-live',
          // Mid-combat on the last combatant, which is the departing PC.
          currentTurn: 1,
          combatants: [
            { name: 'Goblin', isNpc: true },
            { name: 'Aria', isNpc: false, characterId: 'char-1' },
          ],
        },
      ]);
      prisma.encounter.update.mockResolvedValue({});
      prisma.campaignPlayer.delete.mockResolvedValue({});

      await service.removePlayer(CAMPAIGN_ID, USER_ID_2, USER_ID);

      // The trimmed list has one entry, so currentTurn (1) is re-clamped to 0 in
      // the same write — the turn pointer can never address a missing row.
      expect(prisma.encounter.update).toHaveBeenCalledWith({
        where: { id: 'enc-live' },
        data: {
          combatants: [{ name: 'Goblin', isNpc: true }],
          version: { increment: 1 },
          currentTurn: 0,
        },
      });
    });

    it('propagates the error and does not re-fetch the campaign when a cleanup step fails (rollback)', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue(mockCampaign);
      prisma.character.findMany.mockResolvedValue([]);
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

  describe('leaveCampaign (VEG-359)', () => {
    it('blocks the owner from leaving their own campaign and runs no cleanup', async () => {
      // mockCampaign.ownerId === USER_ID, so USER_ID is the owner.
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaign);

      await expect(service.leaveCampaign(CAMPAIGN_ID, USER_ID)).rejects.toThrow(ForbiddenException);

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lets a non-owner member leave, running the same cleanup as a DM removal', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaign); // owner is USER_ID
      prisma.character.findMany.mockResolvedValue([]); // no owned chars → no combatant cleanup
      prisma.character.updateMany.mockResolvedValue({ count: 1 });
      prisma.note.deleteMany.mockResolvedValue({ count: 1 });
      prisma.campaignPlayer.delete.mockResolvedValue({});

      const result = await service.leaveCampaign(CAMPAIGN_ID, USER_ID_2);

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID_2);
      // Self-service: the owner-gate is never consulted.
      expect(campaignAuth.assertCampaignOwner).not.toHaveBeenCalled();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // The leaver's characters are detached (campaignId -> null), not deleted.
      expect(prisma.character.updateMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID, userId: USER_ID_2 },
        data: { campaignId: null },
      });
      // Only the leaver's PRIVATE notes are deleted.
      expect(prisma.note.deleteMany).toHaveBeenCalledWith({
        where: {
          campaignId: CAMPAIGN_ID,
          authorId: USER_ID_2,
          visibility: NoteVisibility.PRIVATE,
        },
      });
      // The membership join row is deleted.
      expect(prisma.campaignPlayer.delete).toHaveBeenCalledWith({
        where: { campaignId_userId: { campaignId: CAMPAIGN_ID, userId: USER_ID_2 } },
      });
      // Self-leave returns no body — the caller is no longer a member.
      expect(result).toBeUndefined();
    });

    it('propagates ForbiddenException for a non-member without running cleanup', async () => {
      campaignAuth.assertCampaignMember.mockRejectedValue(
        new ForbiddenException('You are not a member of this campaign')
      );

      await expect(service.leaveCampaign(CAMPAIGN_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
