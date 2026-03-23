import { Test, TestingModule } from "@nestjs/testing";
import { SrdService } from "./srd.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  MockPrismaService,
  prismaMockProvider,
} from "../test/prisma-mock.factory";

describe("SrdService", () => {
  let service: SrdService;
  let prisma: MockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SrdService, prismaMockProvider()],
    }).compile();

    service = module.get<SrdService>(SrdService);
    prisma = module.get<MockPrismaService>(PrismaService as any);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  // ── Spells ──────────────────────────────────────────

  describe("searchSpells", () => {
    it("passes empty where when no filters provided", async () => {
      prisma.spell.findMany.mockResolvedValue([]);

      await service.searchSpells();

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: "asc" },
      });
    });

    it("builds OR contains insensitive when query provided", async () => {
      prisma.spell.findMany.mockResolvedValue([]);

      await service.searchSpells("fire");

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: "fire", mode: "insensitive" } },
            { description: { contains: "fire", mode: "insensitive" } },
          ],
        },
        orderBy: { name: "asc" },
      });
    });

    it("adds classes has filter when classFilter provided", async () => {
      prisma.spell.findMany.mockResolvedValue([]);

      await service.searchSpells(undefined, "Wizard");

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {
          classes: { has: "Wizard" },
        },
        orderBy: { name: "asc" },
      });
    });

    it("adds school filter when school provided", async () => {
      prisma.spell.findMany.mockResolvedValue([]);

      await service.searchSpells(undefined, undefined, undefined, "Evocation");

      expect(prisma.spell.findMany).toHaveBeenCalledWith({
        where: {
          school: "Evocation",
        },
        orderBy: { name: "asc" },
      });
    });
  });

  // ── Monsters ────────────────────────────────────────

  describe("searchMonsters", () => {
    it("applies parseFloat on cr filter", async () => {
      prisma.monster.findMany.mockResolvedValue([]);

      await service.searchMonsters(undefined, undefined, "0.25");

      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          challengeRating: 0.25,
        },
        orderBy: { name: "asc" },
      });
    });

    it("adds size filter when provided", async () => {
      prisma.monster.findMany.mockResolvedValue([]);

      await service.searchMonsters(undefined, undefined, undefined, "Large");

      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          size: "Large",
        },
        orderBy: { name: "asc" },
      });
    });

    it("adds minCr and maxCr range filter", async () => {
      prisma.monster.findMany.mockResolvedValue([]);

      await service.searchMonsters(
        undefined,
        undefined,
        undefined,
        undefined,
        "5",
        "10",
      );

      expect(prisma.monster.findMany).toHaveBeenCalledWith({
        where: {
          challengeRating: { gte: 5, lte: 10 },
        },
        orderBy: { name: "asc" },
      });
    });
  });

  // ── Items ───────────────────────────────────────────

  describe("searchItems", () => {
    it("adds category filter when provided", async () => {
      prisma.item.findMany.mockResolvedValue([]);

      await service.searchItems(undefined, "Potion");

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          category: "Potion",
        },
        orderBy: { name: "asc" },
      });
    });

    it("adds rarity filter when provided", async () => {
      prisma.item.findMany.mockResolvedValue([]);

      await service.searchItems(undefined, undefined, "Rare");

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          rarity: "Rare",
        },
        orderBy: { name: "asc" },
      });
    });

    it("adds isMagic filter when provided", async () => {
      prisma.item.findMany.mockResolvedValue([]);

      await service.searchItems(undefined, undefined, undefined, "true");

      expect(prisma.item.findMany).toHaveBeenCalledWith({
        where: {
          isMagic: true,
        },
        orderBy: { name: "asc" },
      });
    });
  });

  // ── Classes ─────────────────────────────────────────

  describe("findClass", () => {
    it("includes subclasses relation", async () => {
      prisma.srdClass.findUnique.mockResolvedValue({
        id: "1",
        name: "Fighter",
        subclasses: [],
      });

      await service.findClass("1");

      expect(prisma.srdClass.findUnique).toHaveBeenCalledWith({
        where: { id: "1" },
        include: { subclasses: true },
      });
    });
  });

  // ── Races ───────────────────────────────────────────

  describe("findRace", () => {
    it("includes subraces relation", async () => {
      prisma.race.findUnique.mockResolvedValue({
        id: "1",
        name: "Elf",
        subraces: [],
      });

      await service.findRace("1");

      expect(prisma.race.findUnique).toHaveBeenCalledWith({
        where: { id: "1" },
        include: { subraces: true },
      });
    });
  });

  // ── Subclasses ──────────────────────────────────────

  describe("searchSubclasses", () => {
    it("passes empty where when no filter", async () => {
      prisma.subclass.findMany.mockResolvedValue([]);

      await service.searchSubclasses();

      expect(prisma.subclass.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: "asc" },
      });
    });

    it("filters by classId", async () => {
      prisma.subclass.findMany.mockResolvedValue([]);

      await service.searchSubclasses("class-1");

      expect(prisma.subclass.findMany).toHaveBeenCalledWith({
        where: { classId: "class-1" },
        orderBy: { name: "asc" },
      });
    });
  });

  // ── Subraces ────────────────────────────────────────

  describe("searchSubraces", () => {
    it("filters by raceId", async () => {
      prisma.subrace.findMany.mockResolvedValue([]);

      await service.searchSubraces("race-1");

      expect(prisma.subrace.findMany).toHaveBeenCalledWith({
        where: { raceId: "race-1" },
        orderBy: { name: "asc" },
      });
    });
  });

  // ── Backgrounds ─────────────────────────────────────

  describe("searchBackgrounds", () => {
    it("passes empty where when no query", async () => {
      prisma.background.findMany.mockResolvedValue([]);

      await service.searchBackgrounds();

      expect(prisma.background.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: "asc" },
      });
    });
  });

  // ── Feats ───────────────────────────────────────────

  describe("searchFeats", () => {
    it("passes empty where when no query", async () => {
      prisma.feat.findMany.mockResolvedValue([]);

      await service.searchFeats();

      expect(prisma.feat.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { name: "asc" },
      });
    });
  });

  // ── Conditions ──────────────────────────────────────

  describe("findAllConditions", () => {
    it("returns all conditions ordered by name", async () => {
      prisma.condition.findMany.mockResolvedValue([]);

      await service.findAllConditions();

      expect(prisma.condition.findMany).toHaveBeenCalledWith({
        orderBy: { name: "asc" },
      });
    });
  });

  // ── Skills ──────────────────────────────────────────

  describe("searchSkills", () => {
    it("filters by ability", async () => {
      prisma.skill.findMany.mockResolvedValue([]);

      await service.searchSkills("Dexterity");

      expect(prisma.skill.findMany).toHaveBeenCalledWith({
        where: { ability: "Dexterity" },
        orderBy: { name: "asc" },
      });
    });
  });

  // ── Languages ───────────────────────────────────────

  describe("searchLanguages", () => {
    it("filters by type", async () => {
      prisma.language.findMany.mockResolvedValue([]);

      await service.searchLanguages("Standard");

      expect(prisma.language.findMany).toHaveBeenCalledWith({
        where: { type: "Standard" },
        orderBy: { name: "asc" },
      });
    });
  });
});
