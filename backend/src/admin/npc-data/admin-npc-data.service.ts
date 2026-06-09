import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { isNpcDataTable, NpcDataTable } from './admin-npc-data.types';
import { CreateNameRowDto } from './dto/create-name-row.dto';
import { CreateAppearanceRowDto } from './dto/create-appearance-row.dto';
import { CreateLootTemplateRowDto } from './dto/create-loot-template-row.dto';
import { CreateTrinketRowDto } from './dto/create-trinket-row.dto';
import { CreatePersonalityRowDto } from './dto/create-personality-row.dto';

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
      case 'names': {
        const dto = validateRow(CreateNameRowDto, input);
        return this.prisma.npcNamePool.create({
          data: {
            race: dto.race,
            gender: dto.gender,
            kind: dto.kind,
            value: dto.value,
            source: 'user',
          },
        });
      }
      case 'appearance': {
        const dto = validateRow(CreateAppearanceRowDto, input);
        return this.prisma.npcAppearanceTrait.create({
          data: {
            race: dto.race,
            category: dto.category,
            trait: dto.trait,
            source: 'user',
          },
        });
      }
      case 'loot-templates': {
        const dto = validateRow(CreateLootTemplateRowDto, input);
        return this.prisma.npcLootTemplate.create({
          data: {
            profession: dto.profession,
            crBucket: dto.crBucket,
            coinage: dto.coinage as Prisma.InputJsonValue,
            items: dto.items as Prisma.InputJsonValue,
            source: 'user',
          },
        });
      }
      case 'trinkets': {
        const dto = validateRow(CreateTrinketRowDto, input);
        return this.prisma.trinket.create({
          data: {
            description: dto.description,
            source: 'user',
          },
        });
      }
      case 'personality': {
        const dto = validateRow(CreatePersonalityRowDto, input);
        return this.prisma.npcCustomPersonality.create({
          data: {
            background: dto.background,
            kind: dto.kind,
            value: dto.value,
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

// Mirrors the global ValidationPipe (whitelist + forbidNonWhitelisted), which cannot
// validate this endpoint itself because the create body's class depends on the :table param.
function validateRow<T extends object>(cls: new () => T, input: CreateRowInput): T {
  const instance = plainToInstance(cls, input);
  const errors = validateSync(instance, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) {
    throw new BadRequestException(errors.flatMap(e => Object.values(e.constraints ?? {})));
  }
  return instance;
}
