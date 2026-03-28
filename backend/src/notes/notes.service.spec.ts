import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotesService } from './notes.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from '../test/fixtures';

describe('NotesService', () => {
  let service: NotesService;
  let prisma: MockPrismaService;
  let campaignAuth: {
    assertCampaignMember: jest.Mock;
    findCampaignOrFail: jest.Mock;
    assertAuthorOrDm: jest.Mock;
  };

  const NOTE_ID = 'note-1111-2222-3333-444444444444';

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

  const mockNote = {
    id: NOTE_ID,
    campaignId: CAMPAIGN_ID,
    authorId: USER_ID,
    title: 'Session 1 Notes',
    content: 'The party entered the dungeon.',
    visibility: 'party',
    sessionNumber: 1,
    tags: ['session'],
    createdAt: new Date('2025-02-01T00:00:00Z'),
    updatedAt: new Date('2025-02-01T00:00:00Z'),
  };

  const mockPrivateNote = {
    ...mockNote,
    id: 'note-priv-2222-3333-444444444444',
    visibility: 'private',
    authorId: USER_ID,
    title: 'DM Secret Note',
  };

  beforeEach(async () => {
    campaignAuth = {
      assertCampaignMember: jest.fn(),
      findCampaignOrFail: jest.fn(),
      assertAuthorOrDm: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        prismaMockProvider(),
        { provide: CampaignAuthService, useValue: campaignAuth },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('verifies membership and sets authorId', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);
      prisma.note.create.mockResolvedValue(mockNote);

      const dto = {
        campaignId: CAMPAIGN_ID,
        title: 'Session 1 Notes',
        content: 'The party entered the dungeon.',
        visibility: 'party' as any,
      };

      const result = await service.create(USER_ID, dto);

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.note.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          authorId: USER_ID,
        },
      });
      expect(result).toEqual(mockNote);
    });
  });

  describe('findAllForCampaign', () => {
    const pagination = { page: 1, limit: 20 };

    it('DM sees all notes (no visibility filter)', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);
      prisma.note.findMany.mockResolvedValue([mockNote, mockPrivateNote]);
      prisma.note.count.mockResolvedValue(2);

      const result = await service.findAllForCampaign(CAMPAIGN_ID, USER_ID, pagination);

      expect(prisma.note.findMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [mockNote, mockPrivateNote],
        total: 2,
        page: 1,
        lastPage: 1,
      });
    });

    it('player sees PARTY notes and own PRIVATE notes only', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);
      prisma.note.findMany.mockResolvedValue([mockNote]);
      prisma.note.count.mockResolvedValue(1);

      const result = await service.findAllForCampaign(CAMPAIGN_ID, USER_ID_2, pagination);

      expect(prisma.note.findMany).toHaveBeenCalledWith({
        where: {
          campaignId: CAMPAIGN_ID,
          OR: [{ visibility: 'party' }, { authorId: USER_ID_2, visibility: 'private' }],
        },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        data: [mockNote],
        total: 1,
        page: 1,
        lastPage: 1,
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when note does not exist', async () => {
      prisma.note.findUnique.mockResolvedValue(null);

      await expect(service.findOne(NOTE_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('DM can access any note including private', async () => {
      prisma.note.findUnique.mockResolvedValue(mockPrivateNote);
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);

      const result = await service.findOne(mockPrivateNote.id, USER_ID);

      expect(result).toEqual(mockPrivateNote);
    });

    it('author can access their own private note', async () => {
      const playerPrivateNote = { ...mockPrivateNote, authorId: USER_ID_2 };
      prisma.note.findUnique.mockResolvedValue(playerPrivateNote);
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);

      const result = await service.findOne(playerPrivateNote.id, USER_ID_2);

      expect(result).toEqual(playerPrivateNote);
    });

    it('any member can access party-visible notes', async () => {
      prisma.note.findUnique.mockResolvedValue(mockNote); // visibility: 'party'
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);

      const result = await service.findOne(NOTE_ID, USER_ID_2);

      expect(result).toEqual(mockNote);
    });

    it('throws ForbiddenException for non-author non-DM on private note', async () => {
      const privateNoteByOwner = {
        ...mockPrivateNote,
        authorId: USER_ID,
      };
      prisma.note.findUnique.mockResolvedValue(privateNoteByOwner);
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);

      await expect(service.findOne(privateNoteByOwner.id, USER_ID_2)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('throws ForbiddenException for non-author non-DM on dm_only note', async () => {
      const dmOnlyNote = { ...mockNote, visibility: 'dm_only', authorId: USER_ID };
      prisma.note.findUnique.mockResolvedValue(dmOnlyNote);
      campaignAuth.assertCampaignMember.mockResolvedValue(mockCampaignOwned);

      await expect(service.findOne(dmOnlyNote.id, USER_ID_2)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('author can update their own note', async () => {
      const updatedNote = { ...mockNote, title: 'Updated Title' };
      prisma.note.findUnique.mockResolvedValue(mockNote);
      prisma.note.update.mockResolvedValue(updatedNote);

      const result = await service.update(NOTE_ID, USER_ID, { title: 'Updated Title' });

      expect(prisma.note.update).toHaveBeenCalledWith({
        where: { id: NOTE_ID },
        data: { title: 'Updated Title' },
      });
      expect(result).toEqual(updatedNote);
    });

    it('throws NotFoundException when note does not exist', async () => {
      prisma.note.findUnique.mockResolvedValue(null);

      await expect(service.update(NOTE_ID, USER_ID, { title: 'New' })).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws ForbiddenException for non-author', async () => {
      prisma.note.findUnique.mockResolvedValue(mockNote);

      await expect(service.update(NOTE_ID, USER_ID_2, { title: 'Hacked Title' })).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('remove', () => {
    it('author can delete their own note', async () => {
      prisma.note.findUnique.mockResolvedValue(mockNote);
      campaignAuth.findCampaignOrFail.mockResolvedValue(mockCampaignOwned);
      prisma.note.delete.mockResolvedValue(mockNote);

      await service.remove(NOTE_ID, USER_ID);

      expect(campaignAuth.findCampaignOrFail).toHaveBeenCalledWith(CAMPAIGN_ID);
      expect(campaignAuth.assertAuthorOrDm).toHaveBeenCalledWith(
        USER_ID, // authorId
        USER_ID, // campaignOwnerId
        USER_ID // userId
      );
      expect(prisma.note.delete).toHaveBeenCalledWith({
        where: { id: NOTE_ID },
      });
    });

    it('DM can delete any note', async () => {
      // Note authored by USER_ID_2, campaign owned by USER_ID (DM)
      const playerNote = { ...mockNote, authorId: USER_ID_2 };
      prisma.note.findUnique.mockResolvedValue(playerNote);
      campaignAuth.findCampaignOrFail.mockResolvedValue(mockCampaignOwned);
      prisma.note.delete.mockResolvedValue(playerNote);

      await service.remove(NOTE_ID, USER_ID);

      expect(campaignAuth.assertAuthorOrDm).toHaveBeenCalledWith(
        USER_ID_2, // authorId
        USER_ID, // campaignOwnerId
        USER_ID // userId (DM)
      );
      expect(prisma.note.delete).toHaveBeenCalledWith({
        where: { id: NOTE_ID },
      });
    });

    it('throws NotFoundException when note does not exist', async () => {
      prisma.note.findUnique.mockResolvedValue(null);

      await expect(service.remove(NOTE_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for non-author non-DM', async () => {
      prisma.note.findUnique.mockResolvedValue(mockNote);
      campaignAuth.findCampaignOrFail.mockResolvedValue(mockCampaignOwned);
      campaignAuth.assertAuthorOrDm.mockImplementation(() => {
        throw new ForbiddenException('Only the author or DM can delete this note');
      });

      // USER_ID_2 is not the author (USER_ID) and not the DM (USER_ID)
      await expect(service.remove(NOTE_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
    });
  });
});
