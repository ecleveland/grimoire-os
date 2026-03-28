import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { QuerySpellsDto } from './dto/query-spells.dto';
import { QueryMonstersDto } from './dto/query-monsters.dto';
import { QueryItemsDto } from './dto/query-items.dto';

@Injectable()
export class SrdService {
  constructor(private prisma: PrismaService) {}

  // ── Spells ──────────────────────────────────────────

  async searchSpells(dto: QuerySpellsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (dto.q) {
      where.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
    if (dto.class) where.classes = { has: dto.class };
    if (dto.level !== undefined) where.level = dto.level;
    if (dto.school) where.school = dto.school;

    const [data, total] = await Promise.all([
      this.prisma.spell.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.spell.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findSpell(id: string) {
    return this.prisma.spell.findUnique({ where: { id } });
  }

  // ── Monsters ────────────────────────────────────────

  async searchMonsters(dto: QueryMonstersDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (dto.q) {
      where.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
    if (dto.type) where.type = dto.type;
    if (dto.cr) where.challengeRating = parseFloat(dto.cr);
    if (dto.size) where.size = dto.size;
    if (dto.minCr || dto.maxCr) {
      where.challengeRating = {
        ...(dto.minCr ? { gte: parseFloat(dto.minCr) } : {}),
        ...(dto.maxCr ? { lte: parseFloat(dto.maxCr) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.monster.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.monster.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findMonster(id: string) {
    return this.prisma.monster.findUnique({ where: { id } });
  }

  // ── Items ───────────────────────────────────────────

  async searchItems(dto: QueryItemsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const where: Record<string, unknown> = {};
    if (dto.q) {
      where.OR = [
        { name: { contains: dto.q, mode: 'insensitive' } },
        { description: { contains: dto.q, mode: 'insensitive' } },
      ];
    }
    if (dto.category) where.category = dto.category;
    if (dto.rarity) where.rarity = dto.rarity;
    if (dto.isMagic !== undefined) where.isMagic = dto.isMagic === 'true';

    const [data, total] = await Promise.all([
      this.prisma.item.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.item.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  async findItem(id: string) {
    return this.prisma.item.findUnique({ where: { id } });
  }

  // ── Classes ─────────────────────────────────────────

  async findAllClasses() {
    return this.prisma.srdClass.findMany({ orderBy: { name: 'asc' } });
  }

  async findClass(id: string) {
    return this.prisma.srdClass.findUnique({
      where: { id },
      include: { subclasses: true },
    });
  }

  // ── Races ───────────────────────────────────────────

  async findAllRaces() {
    return this.prisma.race.findMany({ orderBy: { name: 'asc' } });
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
    return this.prisma.subclass.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findSubclass(id: string) {
    return this.prisma.subclass.findUnique({ where: { id } });
  }

  // ── Subraces ────────────────────────────────────────

  async searchSubraces(raceId?: string) {
    const where: Record<string, unknown> = {};
    if (raceId) where.raceId = raceId;
    return this.prisma.subrace.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findSubrace(id: string) {
    return this.prisma.subrace.findUnique({ where: { id } });
  }

  // ── Backgrounds ─────────────────────────────────────

  async searchBackgrounds(query?: string) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }
    return this.prisma.background.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findBackground(id: string) {
    return this.prisma.background.findUnique({ where: { id } });
  }

  // ── Feats ───────────────────────────────────────────

  async searchFeats(query?: string) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }
    return this.prisma.feat.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findFeat(id: string) {
    return this.prisma.feat.findUnique({ where: { id } });
  }

  // ── Conditions ──────────────────────────────────────

  async findAllConditions() {
    return this.prisma.condition.findMany({ orderBy: { name: 'asc' } });
  }

  async findCondition(id: string) {
    return this.prisma.condition.findUnique({ where: { id } });
  }

  // ── Skills ──────────────────────────────────────────

  async searchSkills(ability?: string) {
    const where: Record<string, unknown> = {};
    if (ability) where.ability = ability;
    return this.prisma.skill.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findSkill(id: string) {
    return this.prisma.skill.findUnique({ where: { id } });
  }

  // ── Languages ───────────────────────────────────────

  async searchLanguages(type?: string) {
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    return this.prisma.language.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findLanguage(id: string) {
    return this.prisma.language.findUnique({ where: { id } });
  }
}
