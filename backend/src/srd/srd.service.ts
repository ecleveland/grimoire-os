import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SrdService {
  constructor(private prisma: PrismaService) {}

  async searchSpells(query?: string, classFilter?: string, level?: number) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }
    if (classFilter) where.classes = { has: classFilter };
    if (level !== undefined) where.level = level;
    return this.prisma.spell.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findSpell(id: string) {
    return this.prisma.spell.findUnique({ where: { id } });
  }

  async searchMonsters(query?: string, type?: string, cr?: string) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }
    if (type) where.type = type;
    if (cr) where.challengeRating = parseFloat(cr);
    return this.prisma.monster.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findMonster(id: string) {
    return this.prisma.monster.findUnique({ where: { id } });
  }

  async searchItems(query?: string, category?: string) {
    const where: Record<string, unknown> = {};
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }
    if (category) where.category = category;
    return this.prisma.item.findMany({ where, orderBy: { name: 'asc' } });
  }

  async findItem(id: string) {
    return this.prisma.item.findUnique({ where: { id } });
  }

  async findAllClasses() {
    return this.prisma.srdClass.findMany({ orderBy: { name: 'asc' } });
  }

  async findClass(id: string) {
    return this.prisma.srdClass.findUnique({ where: { id } });
  }

  async findAllRaces() {
    return this.prisma.race.findMany({ orderBy: { name: 'asc' } });
  }

  async findRace(id: string) {
    return this.prisma.race.findUnique({ where: { id } });
  }
}
