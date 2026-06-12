import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Spell } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentAccessService, ContentActor } from './content-access.service';
import { HOMEBREW_SOURCE_LABEL, mapWriteError } from './homebrew-write.helpers';
import { CreateSpellDto } from './dto/create-spell.dto';
import { UpdateSpellDto } from './dto/update-spell.dto';

/**
 * CRUD for user-authored (homebrew) spells (VEG-294), following the
 * {@link HomebrewMonstersService} pattern. Authorization is delegated to
 * {@link ContentAccessService}: any authenticated user may create homebrew for
 * themselves; rows are writable per their tier (owner for homebrew, admins for
 * shared, never for SRD).
 */
@Injectable()
export class HomebrewSpellsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentAccess: ContentAccessService
  ) {}

  async create(dto: CreateSpellDto, actor: ContentActor): Promise<Spell> {
    this.contentAccess.assertCanCreate('homebrew', actor);

    try {
      return await this.prisma.spell.create({
        data: {
          ...this.toColumnData(dto),
          source: HOMEBREW_SOURCE_LABEL,
          contentSource: 'homebrew',
          createdById: actor.userId,
        } as Prisma.SpellUncheckedCreateInput,
      });
    } catch (err) {
      mapWriteError(err, 'homebrew', 'spell');
    }
  }

  async update(id: string, dto: UpdateSpellDto, actor: ContentActor): Promise<Spell> {
    const row = await this.findWritableRow(id, actor);

    try {
      return await this.prisma.spell.update({
        where: { id },
        data: this.toColumnData(dto) as Prisma.SpellUpdateInput,
      });
    } catch (err) {
      mapWriteError(err, row.contentSource, 'spell');
    }
  }

  async remove(id: string, actor: ContentActor): Promise<void> {
    const row = await this.findWritableRow(id, actor);
    try {
      await this.prisma.spell.delete({ where: { id } });
    } catch (err) {
      mapWriteError(err, row.contentSource, 'spell');
    }
  }

  /**
   * Load the row and authorize the write. Rows the actor cannot even read
   * (someone else's homebrew) 404 rather than 403 so their existence does not
   * leak; visible-but-immutable rows (SRD, shared for non-admins) 403.
   */
  private async findWritableRow(id: string, actor: ContentActor): Promise<Spell> {
    const row = await this.prisma.spell.findUnique({ where: { id } });
    if (!row || !this.contentAccess.canRead(row, actor.userId)) {
      throw new NotFoundException('Spell not found');
    }
    this.contentAccess.assertWritable(row, actor);
    return row;
  }

  /**
   * Map a DTO onto Prisma column data, dropping anything that is not a plain
   * spell column — ownership/tier/source fields can never be set by clients,
   * even if a raw payload sneaks past DTO validation. `classes`, `ritual`, and
   * `concentration` are non-nullable columns, so a null clear (the client's way
   * of resetting an optional field, VEG-316) becomes their empty default.
   */
  private toColumnData(dto: CreateSpellDto | UpdateSpellDto): Record<string, unknown> {
    const {
      contentSource: _contentSource,
      createdById: _createdById,
      campaignId: _campaignId,
      source: _source,
      id: _id,
      ...data
    } = dto as Record<string, unknown>;
    if ('classes' in data && data.classes === null) data.classes = [];
    if ('ritual' in data && data.ritual === null) data.ritual = false;
    if ('concentration' in data && data.concentration === null) data.concentration = false;
    return data;
  }
}
