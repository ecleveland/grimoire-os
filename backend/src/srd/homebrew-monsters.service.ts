import { Injectable, NotFoundException } from '@nestjs/common';
import { Monster, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentAccessService, ContentActor } from './content-access.service';
import { HOMEBREW_SOURCE_LABEL, mapWriteError } from './homebrew-write.helpers';
import { CreateMonsterDto } from './dto/create-monster.dto';
import { UpdateMonsterDto } from './dto/update-monster.dto';

/** Monster columns stored as Json — plain null must become Prisma.DbNull. */
const JSON_COLUMNS = [
  'savingThrows',
  'skills',
  'specialAbilities',
  'actions',
  'reactions',
  'legendaryActions',
] as const;

/**
 * CRUD for user-authored (homebrew) monsters — the first per-type consumer of
 * the generalized content model (VEG-292/VEG-293). Authorization is delegated
 * to {@link ContentAccessService}: any authenticated user may create homebrew
 * for themselves; rows are writable per their tier (owner for homebrew, admins
 * for shared, never for SRD).
 */
@Injectable()
export class HomebrewMonstersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentAccess: ContentAccessService
  ) {}

  async create(dto: CreateMonsterDto, actor: ContentActor): Promise<Monster> {
    this.contentAccess.assertCanCreate('homebrew', actor);

    try {
      return await this.prisma.monster.create({
        data: {
          ...this.toColumnData(dto),
          // The frontend monster type requires `actions`; never persist null.
          actions: (dto.actions ?? []) as unknown as Prisma.InputJsonValue,
          source: HOMEBREW_SOURCE_LABEL,
          contentSource: 'homebrew',
          createdById: actor.userId,
        } as Prisma.MonsterUncheckedCreateInput,
      });
    } catch (err) {
      mapWriteError(err, 'homebrew', 'monster');
    }
  }

  async update(id: string, dto: UpdateMonsterDto, actor: ContentActor): Promise<Monster> {
    const row = await this.findWritableRow(id, actor);

    try {
      return await this.prisma.monster.update({
        where: { id },
        data: this.toColumnData(dto) as Prisma.MonsterUpdateInput,
      });
    } catch (err) {
      mapWriteError(err, row.contentSource, 'monster');
    }
  }

  async remove(id: string, actor: ContentActor): Promise<void> {
    const row = await this.findWritableRow(id, actor);
    try {
      await this.prisma.monster.delete({ where: { id } });
    } catch (err) {
      mapWriteError(err, row.contentSource, 'monster');
    }
  }

  /**
   * Load the row and authorize the write. Rows the actor cannot even read
   * (someone else's homebrew) 404 rather than 403 so their existence does not
   * leak; visible-but-immutable rows (SRD, shared for non-admins) 403.
   */
  private async findWritableRow(id: string, actor: ContentActor): Promise<Monster> {
    const row = await this.prisma.monster.findUnique({ where: { id } });
    if (!row || !this.contentAccess.canRead(row, actor.userId)) {
      throw new NotFoundException('Monster not found');
    }
    this.contentAccess.assertWritable(row, actor);
    return row;
  }

  /**
   * Map a DTO onto Prisma column data, dropping anything that is not a plain
   * monster column — ownership/tier/source fields can never be set by clients,
   * even if a raw payload sneaks past DTO validation. Json columns sent as
   * `null` (the client's way of clearing an optional field, VEG-316) become
   * `Prisma.DbNull`: Prisma rejects plain JS null on Json fields.
   */
  private toColumnData(dto: CreateMonsterDto | UpdateMonsterDto): Record<string, unknown> {
    const {
      contentSource: _contentSource,
      createdById: _createdById,
      campaignId: _campaignId,
      source: _source,
      id: _id,
      ...data
    } = dto as Record<string, unknown>;
    for (const key of JSON_COLUMNS) {
      if (key in data && data[key] === null) data[key] = Prisma.DbNull;
    }
    // The read-side SrdMonster type requires `actions`; a null clear becomes [].
    if ('actions' in data && data.actions === Prisma.DbNull) data.actions = [];
    return data;
  }
}
