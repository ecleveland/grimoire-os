import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SrdService {
  constructor(private prisma: PrismaService) {}

  // ── Spells ──────────────────────────────────────────

  async searchSpells(
    query?: string,
    classFilter?: string,
    level?: number,
    school?: string,
  ) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
    }
    if (classFilter) where.classes = { has: classFilter };
    if (level !== undefined) where.level = level;
    if (school) where.school = school;
    return this.prisma.spell.findMany({ where, orderBy: { name: "asc" } });
  }

  async findSpell(id: string) {
    return this.prisma.spell.findUnique({ where: { id } });
  }

  // ── Monsters ────────────────────────────────────────

  async searchMonsters(
    query?: string,
    type?: string,
    cr?: string,
    size?: string,
    minCr?: string,
    maxCr?: string,
  ) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
    }
    if (type) where.type = type;
    if (cr) where.challengeRating = parseFloat(cr);
    if (size) where.size = size;
    if (minCr || maxCr) {
      where.challengeRating = {
        ...(minCr ? { gte: parseFloat(minCr) } : {}),
        ...(maxCr ? { lte: parseFloat(maxCr) } : {}),
      };
    }
    return this.prisma.monster.findMany({ where, orderBy: { name: "asc" } });
  }

  async findMonster(id: string) {
    return this.prisma.monster.findUnique({ where: { id } });
  }

  // ── Items ───────────────────────────────────────────

  async searchItems(
    query?: string,
    category?: string,
    rarity?: string,
    isMagic?: string,
  ) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
    }
    if (category) where.category = category;
    if (rarity) where.rarity = rarity;
    if (isMagic !== undefined) where.isMagic = isMagic === "true";
    return this.prisma.item.findMany({ where, orderBy: { name: "asc" } });
  }

  async findItem(id: string) {
    return this.prisma.item.findUnique({ where: { id } });
  }

  // ── Classes ─────────────────────────────────────────

  async findAllClasses() {
    return this.prisma.srdClass.findMany({ orderBy: { name: "asc" } });
  }

  async findClass(id: string) {
    return this.prisma.srdClass.findUnique({
      where: { id },
      include: { subclasses: true },
    });
  }

  // ── Races ───────────────────────────────────────────

  async findAllRaces() {
    return this.prisma.race.findMany({ orderBy: { name: "asc" } });
  }

  async findRace(id: string) {
    return this.prisma.race.findUnique({
      where: { id },
      include: { subraces: true },
    });
  }

  // ── Subclasses ──────────────────────────────────────

  async searchSubclasses(classId?: string) {
    const where: Record<string, unknown> = {};
    if (classId) where.classId = classId;
    return this.prisma.subclass.findMany({ where, orderBy: { name: "asc" } });
  }

  async findSubclass(id: string) {
    return this.prisma.subclass.findUnique({ where: { id } });
  }

  // ── Subraces ────────────────────────────────────────

  async searchSubraces(raceId?: string) {
    const where: Record<string, unknown> = {};
    if (raceId) where.raceId = raceId;
    return this.prisma.subrace.findMany({ where, orderBy: { name: "asc" } });
  }

  async findSubrace(id: string) {
    return this.prisma.subrace.findUnique({ where: { id } });
  }

  // ── Backgrounds ─────────────────────────────────────

  async searchBackgrounds(query?: string) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
    }
    return this.prisma.background.findMany({ where, orderBy: { name: "asc" } });
  }

  async findBackground(id: string) {
    return this.prisma.background.findUnique({ where: { id } });
  }

  // ── Feats ───────────────────────────────────────────

  async searchFeats(query?: string) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { description: { contains: query, mode: "insensitive" } },
      ];
    }
    return this.prisma.feat.findMany({ where, orderBy: { name: "asc" } });
  }

  async findFeat(id: string) {
    return this.prisma.feat.findUnique({ where: { id } });
  }

  // ── Conditions ──────────────────────────────────────

  async findAllConditions() {
    return this.prisma.condition.findMany({ orderBy: { name: "asc" } });
  }

  async findCondition(id: string) {
    return this.prisma.condition.findUnique({ where: { id } });
  }

  // ── Skills ──────────────────────────────────────────

  async searchSkills(ability?: string) {
    const where: Record<string, unknown> = {};
    if (ability) where.ability = ability;
    return this.prisma.skill.findMany({ where, orderBy: { name: "asc" } });
  }

  async findSkill(id: string) {
    return this.prisma.skill.findUnique({ where: { id } });
  }

  // ── Languages ───────────────────────────────────────

  async searchLanguages(type?: string) {
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    return this.prisma.language.findMany({ where, orderBy: { name: "asc" } });
  }

  async findLanguage(id: string) {
    return this.prisma.language.findUnique({ where: { id } });
  }
}
