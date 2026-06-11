import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ValidationError, validateSync } from 'class-validator';
import { VALIDATOR_STRICTNESS } from '../../bootstrap-config';
import { PrismaService } from '../../prisma/prisma.service';
import { isNpcDataTable, NpcDataTable } from './admin-npc-data.types';
import { CreateNameRowDto } from './dto/create-name-row.dto';
import { CreateAppearanceRowDto } from './dto/create-appearance-row.dto';
import { CreateLootTemplateRowDto } from './dto/create-loot-template-row.dto';
import { CreateMonsterLootTemplateRowDto } from './dto/create-monster-loot-template-row.dto';
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
        // Each loot-template family is managed under its own slug — 'npc'
        // rows here, 'monster' rows under monster-loot (VEG-304).
        return this.prisma.npcLootTemplate.findMany({
          where: { category: 'npc' },
          orderBy: [{ profession: 'asc' }, { crBucket: 'asc' }],
        });
      case 'monster-loot': {
        const rows = await this.prisma.npcLootTemplate.findMany({
          where: { category: 'monster' },
          orderBy: [{ profession: 'asc' }, { crBucket: 'asc' }],
        });
        return rows.map(toMonsterRow);
      }
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
        await this.assertItemNamesResolvable(dto.items.map(i => i.itemName));
        return this.prisma.npcLootTemplate.create({
          data: {
            category: 'npc',
            profession: dto.profession,
            crBucket: dto.crBucket,
            // Mapped to plain literals: the stored JSON is exactly the
            // LootTemplate shape the loot engine consumes.
            coinage: { gp: dto.coinage.gp, sp: dto.coinage.sp, cp: dto.coinage.cp },
            items: dto.items.map(i => ({ itemName: i.itemName, weight: i.weight, qty: i.qty })),
            source: 'user',
          },
        });
      }
      case 'monster-loot': {
        const dto = validateRow(CreateMonsterLootTemplateRowDto, input);
        // The loot engine resolves duplicate keys first-match over an
        // arbitrary id order, so a second active row for the same type×CR
        // would silently shadow one of the two — and the seed covers most
        // combinations, making collisions the common case, not the edge.
        const clash = await this.prisma.npcLootTemplate.findFirst({
          where: {
            category: 'monster',
            profession: dto.type,
            crBucket: dto.crBucket,
            isActive: true,
          },
        });
        if (clash) {
          throw new BadRequestException(
            `An active ${dto.type} / ${dto.crBucket} template already exists ` +
              `(source: ${clash.source}); disable it first so the loot engine picks this one.`
          );
        }
        await this.assertItemNamesResolvable(dto.items.map(i => i.itemName));
        const row = await this.prisma.npcLootTemplate.create({
          data: {
            category: 'monster',
            profession: dto.type,
            crBucket: dto.crBucket,
            coinage: { gp: dto.coinage.gp, sp: dto.coinage.sp, cp: dto.coinage.cp },
            items: dto.items.map(i => ({ itemName: i.itemName, weight: i.weight, qty: i.qty })),
            source: 'user',
          },
        });
        return toMonsterRow(row);
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
      case 'monster-loot':
        return toMonsterRow(
          await this.prisma.npcLootTemplate.update({ where: { id }, data: { isActive } })
        );
      case 'trinkets':
        return this.prisma.trinket.update({ where: { id }, data: { isActive } });
      case 'personality':
        return this.prisma.npcCustomPersonality.update({ where: { id }, data: { isActive } });
    }
  }

  // Returns void so no exit can leak a raw row — for monster-loot the
  // deleted row still carries the internal `profession` column.
  async remove(table: string, id: string): Promise<void> {
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
        await this.prisma.npcNamePool.delete({ where: { id } });
        return;
      case 'appearance':
        await this.prisma.npcAppearanceTrait.delete({ where: { id } });
        return;
      case 'loot-templates':
      case 'monster-loot':
        await this.prisma.npcLootTemplate.delete({ where: { id } });
        return;
      case 'trinkets':
        await this.prisma.trinket.delete({ where: { id } });
        return;
      case 'personality':
        await this.prisma.npcCustomPersonality.delete({ where: { id } });
        return;
    }
  }

  // Generation resolves template items to catalog ids by exact Item.name
  // (loot-roller), so a name that doesn't resolve would silently produce
  // id-less loot. Reject it at write time instead.
  private async assertItemNamesResolvable(itemNames: string[]): Promise<void> {
    const unique = [...new Set(itemNames)];
    const found = await this.prisma.item.findMany({
      where: { name: { in: unique } },
      select: { name: true },
    });
    const known = new Set(found.map(i => i.name));
    const unknown = unique.filter(n => !known.has(n));
    if (unknown.length > 0) {
      throw new BadRequestException(
        unknown.map(n => `Unknown item "${n}" — item names must match the items catalog exactly`)
      );
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
        // Each family's slug only resolves its own rows: a monster-category
        // id must 404 here (and vice versa), not get mutated cross-editor.
        return this.prisma.npcLootTemplate.findFirst({ where: { id, category: 'npc' } });
      case 'monster-loot':
        return this.prisma.npcLootTemplate.findFirst({ where: { id, category: 'monster' } });
      case 'trinkets':
        return this.prisma.trinket.findUnique({ where: { id } });
      case 'personality':
        return this.prisma.npcCustomPersonality.findUnique({ where: { id } });
    }
  }
}

// Monster templates reuse the NpcLootTemplate table, with the creature type
// stored in the shared `profession` column. The admin API speaks `type` —
// `profession: 'dragon'` would leak the table reuse to every consumer.
function toMonsterRow<T extends { profession: string }>(
  row: T
): Omit<T, 'profession'> & {
  type: string;
} {
  const { profession, ...rest } = row;
  return { ...rest, type: profession };
}

// Mirrors the global ValidationPipe's strictness, which cannot validate this
// endpoint itself because the create body's class depends on the :table param.
function validateRow<T extends object>(cls: new () => T, input: CreateRowInput): T {
  const instance = plainToInstance(cls, input);
  const errors = validateSync(instance, VALIDATOR_STRICTNESS);
  if (errors.length > 0) {
    throw new BadRequestException(collectMessages(errors));
  }
  return instance;
}

// Flattens nested validation errors (e.g. coinage ranges, item entries) so
// the 400 body names the offending field instead of arriving empty.
function collectMessages(errors: ValidationError[]): string[] {
  return errors.flatMap(e => [
    ...Object.values(e.constraints ?? {}),
    ...collectMessages(e.children ?? []),
  ]);
}
