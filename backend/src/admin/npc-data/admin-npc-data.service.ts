import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isNpcDataTable, isPersonalityKind, NpcDataTable } from './admin-npc-data.types';

type CreateRowInput = Record<string, unknown>;

@Injectable()
export class AdminNpcDataService {
  constructor(private readonly prisma: PrismaService) {}

  async list(table: string) {
    this.assertTable(table);
    switch (table) {
      case 'names':
        return this.prisma.npcNamePool.findMany({
          orderBy: [{ race: 'asc' }, { kind: 'asc' }, { value: 'asc' }],
        });
      case 'appearance':
        return this.prisma.npcAppearanceTrait.findMany({
          orderBy: [{ race: 'asc' }, { category: 'asc' }, { trait: 'asc' }],
        });
      case 'loot-templates':
        return this.prisma.npcLootTemplate.findMany({
          orderBy: [{ profession: 'asc' }, { crBucket: 'asc' }],
        });
      case 'trinkets':
        return this.prisma.trinket.findMany({ orderBy: { description: 'asc' } });
      case 'personality':
        return this.prisma.npcCustomPersonality.findMany({
          orderBy: [{ background: 'asc' }, { kind: 'asc' }, { value: 'asc' }],
        });
    }
  }

  async create(table: string, userId: string, input: CreateRowInput) {
    this.assertTable(table);
    switch (table) {
      case 'names':
        return this.prisma.npcNamePool.create({
          data: {
            race: requireString(input.race, 'race'),
            gender: optionalString(input.gender),
            kind: requireString(input.kind, 'kind'),
            value: requireString(input.value, 'value'),
            source: 'user',
          },
        });
      case 'appearance':
        return this.prisma.npcAppearanceTrait.create({
          data: {
            race: requireString(input.race, 'race'),
            category: requireString(input.category, 'category'),
            trait: requireString(input.trait, 'trait'),
            source: 'user',
          },
        });
      case 'loot-templates':
        return this.prisma.npcLootTemplate.create({
          data: {
            profession: requireString(input.profession, 'profession'),
            crBucket: requireString(input.crBucket, 'crBucket'),
            coinage: requireObject(input.coinage, 'coinage'),
            items: requireArrayObject(input.items, 'items'),
            source: 'user',
          },
        });
      case 'trinkets':
        return this.prisma.trinket.create({
          data: {
            description: requireString(input.description, 'description'),
            source: 'user',
          },
        });
      case 'personality': {
        const kind = input.kind;
        if (!isPersonalityKind(kind)) {
          throw new BadRequestException('kind must be one of personalityTraits|ideals|bonds|flaws');
        }
        return this.prisma.npcCustomPersonality.create({
          data: {
            background: requireString(input.background, 'background'),
            kind,
            value: requireString(input.value, 'value'),
            addedById: userId,
          },
        });
      }
    }
  }

  async setActive(table: string, id: string, isActive: boolean) {
    this.assertTable(table);
    const existing = await this.findById(table, id);
    if (!existing) throw new NotFoundException(`Row ${id} not found in ${table}`);

    switch (table) {
      case 'names':
        return this.prisma.npcNamePool.update({ where: { id }, data: { isActive } });
      case 'appearance':
        return this.prisma.npcAppearanceTrait.update({ where: { id }, data: { isActive } });
      case 'loot-templates':
        return this.prisma.npcLootTemplate.update({ where: { id }, data: { isActive } });
      case 'trinkets':
        return this.prisma.trinket.update({ where: { id }, data: { isActive } });
      case 'personality':
        return this.prisma.npcCustomPersonality.update({ where: { id }, data: { isActive } });
    }
  }

  async remove(table: string, id: string) {
    this.assertTable(table);
    const existing = await this.findById(table, id);
    if (!existing) throw new NotFoundException(`Row ${id} not found in ${table}`);

    if (table !== 'personality') {
      const source = (existing as { source?: string }).source;
      if (source !== 'user') {
        throw new ForbiddenException(
          'Only user-contributed rows can be deleted; disable curated/SRD rows instead.'
        );
      }
    }

    switch (table) {
      case 'names':
        return this.prisma.npcNamePool.delete({ where: { id } });
      case 'appearance':
        return this.prisma.npcAppearanceTrait.delete({ where: { id } });
      case 'loot-templates':
        return this.prisma.npcLootTemplate.delete({ where: { id } });
      case 'trinkets':
        return this.prisma.trinket.delete({ where: { id } });
      case 'personality':
        return this.prisma.npcCustomPersonality.delete({ where: { id } });
    }
  }

  private assertTable(table: string): asserts table is NpcDataTable {
    if (!isNpcDataTable(table)) {
      throw new BadRequestException(`Unknown npc-data table: ${table}`);
    }
  }

  private findById(table: NpcDataTable, id: string) {
    switch (table) {
      case 'names':
        return this.prisma.npcNamePool.findUnique({ where: { id } });
      case 'appearance':
        return this.prisma.npcAppearanceTrait.findUnique({ where: { id } });
      case 'loot-templates':
        return this.prisma.npcLootTemplate.findUnique({ where: { id } });
      case 'trinkets':
        return this.prisma.trinket.findUnique({ where: { id } });
      case 'personality':
        return this.prisma.npcCustomPersonality.findUnique({ where: { id } });
    }
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new BadRequestException('Field must be a string when provided');
  }
  return value;
}

function requireObject(value: unknown, field: string): Prisma.InputJsonValue {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an object`);
  }
  return value as Prisma.InputJsonValue;
}

function requireArrayObject(value: unknown, field: string): Prisma.InputJsonValue {
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an array`);
  }
  return value as Prisma.InputJsonValue;
}
