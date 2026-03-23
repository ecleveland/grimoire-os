import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException } from "@nestjs/common";
import { NotesService } from "./notes.service";
import { CampaignsService } from "../campaigns/campaigns.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  MockPrismaService,
  prismaMockProvider,
} from "../test/prisma-mock.factory";
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from "../test/fixtures";

describe("NotesService", () => {
  let service: NotesService;
  let prisma: MockPrismaService;
  let campaignsService: { findOneForUser: jest.Mock; findOne: jest.Mock };

  const NOTE_ID = "note-1111-2222-3333-444444444444";

  const mockCampaignOwned = {
    id: CAMPAIGN_ID,
    name: "Test Campaign",
    ownerId: USER_ID,
    players: [
      {
        id: "cp1",
        campaignId: CAMPAIGN_ID,
        userId: USER_ID,
        joinedAt: new Date(),
      },
      {
        id: "cp2",
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
    title: "Session 1 Notes",
    content: "The party entered the dungeon.",
    visibility: "party",
    sessionNumber: 1,
    tags: ["session"],
    createdAt: new Date("2025-02-01T00:00:00Z"),
    updatedAt: new Date("2025-02-01T00:00:00Z"),
  };

  const mockPrivateNote = {
    ...mockNote,
    id: "note-priv-2222-3333-444444444444",
    visibility: "private",
    authorId: USER_ID,
    title: "DM Secret Note",
  };

  beforeEach(async () => {
    campaignsService = {
      findOneForUser: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        prismaMockProvider(),
        {
          provide: CampaignsService,
          useValue: campaignsService,
        },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("create", () => {
    it("verifies membership and sets authorId", async () => {
      campaignsService.findOneForUser.mockResolvedValue(mockCampaignOwned);
      prisma.note.create.mockResolvedValue(mockNote);

      const dto = {
        campaignId: CAMPAIGN_ID,
        title: "Session 1 Notes",
        content: "The party entered the dungeon.",
        visibility: "party" as any,
      };

      const result = await service.create(USER_ID, dto);

      expect(campaignsService.findOneForUser).toHaveBeenCalledWith(
        CAMPAIGN_ID,
        USER_ID,
      );
      expect(prisma.note.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          authorId: USER_ID,
        },
      });
      expect(result).toEqual(mockNote);
    });
  });

  describe("findAllForCampaign", () => {
    it("DM sees all notes (no visibility filter)", async () => {
      campaignsService.findOneForUser.mockResolvedValue(mockCampaignOwned);
      prisma.note.findMany.mockResolvedValue([mockNote, mockPrivateNote]);

      await service.findAllForCampaign(CAMPAIGN_ID, USER_ID);

      expect(prisma.note.findMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID },
        orderBy: { updatedAt: "desc" },
      });
    });

    it("player sees PARTY notes and own PRIVATE notes only", async () => {
      // USER_ID_2 is a player, not the owner
      campaignsService.findOneForUser.mockResolvedValue(mockCampaignOwned);
      prisma.note.findMany.mockResolvedValue([mockNote]);

      await service.findAllForCampaign(CAMPAIGN_ID, USER_ID_2);

      expect(prisma.note.findMany).toHaveBeenCalledWith({
        where: {
          campaignId: CAMPAIGN_ID,
          OR: [
            { visibility: "party" },
            { authorId: USER_ID_2, visibility: "private" },
          ],
        },
        orderBy: { updatedAt: "desc" },
      });
    });
  });

  describe("findOne", () => {
    it("throws ForbiddenException for non-author non-DM on private note", async () => {
      const privateNoteByOwner = {
        ...mockPrivateNote,
        authorId: USER_ID,
      };
      prisma.note.findUnique.mockResolvedValue(privateNoteByOwner);
      // USER_ID_2 is a member but not DM and not author
      campaignsService.findOneForUser.mockResolvedValue(mockCampaignOwned);

      await expect(
        service.findOne(privateNoteByOwner.id, USER_ID_2),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("update", () => {
    it("throws ForbiddenException for non-author", async () => {
      prisma.note.findUnique.mockResolvedValue(mockNote);

      await expect(
        service.update(NOTE_ID, USER_ID_2, { title: "Hacked Title" }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("remove", () => {
    it("DM can delete any note", async () => {
      // Note authored by USER_ID_2, campaign owned by USER_ID (DM)
      const playerNote = { ...mockNote, authorId: USER_ID_2 };
      prisma.note.findUnique.mockResolvedValue(playerNote);
      campaignsService.findOne.mockResolvedValue(mockCampaignOwned);
      prisma.note.delete.mockResolvedValue(playerNote);

      await service.remove(NOTE_ID, USER_ID);

      expect(prisma.note.delete).toHaveBeenCalledWith({
        where: { id: NOTE_ID },
      });
    });

    it("throws ForbiddenException for non-author non-DM", async () => {
      prisma.note.findUnique.mockResolvedValue(mockNote);
      campaignsService.findOne.mockResolvedValue(mockCampaignOwned);

      // USER_ID_2 is not the author (USER_ID) and not the DM (USER_ID)
      await expect(service.remove(NOTE_ID, USER_ID_2)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
