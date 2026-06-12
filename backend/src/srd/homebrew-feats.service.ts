import { Injectable, NotFoundException } from '@nestjs/common';
import { Feat, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentAccessService, ContentActor } from './content-access.service';
import { HOMEBREW_SOURCE_LABEL, mapWriteError } from './homebrew-write.helpers';
import { CreateFeatDto } from './dto/create-feat.dto';
import { UpdateFeatDto } from './dto/update-feat.dto';

/**
 * CRUD for user-authored (homebrew) feats (VEG-295), following the
 * {@link HomebrewSpellsService} pattern. Authorization is delegated to
 * {@link ContentAccessService}: any authenticated user may create homebrew for
 * themselves; rows are writable per their tier (owner for homebrew, admins for
 * shared, never for SRD).
 */
@Injectable()
export class HomebrewFeatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentAccess: ContentAccessService
  ) {}

  async create(dto: CreateFeatDto, actor: ContentActor): Promise<Feat> {
    this.contentAccess.assertCanCreate('homebrew', actor);

    try {
      return await this.prisma.feat.create({
        data: {
          ...this.toColumnData(dto),
          source: HOMEBREW_SOURCE_LABEL,
          contentSource: 'homebrew',
          createdById: actor.userId,
        } as Prisma.FeatUncheckedCreateInput,
      });
    } catch (err) {
      mapWriteError(err, 'homebrew', 'feat');
    }
  }

  async update(id: string, dto: UpdateFeatDto, actor: ContentActor): Promise<Feat> {
    const row = await this.findWritableRow(id, actor);

    try {
      return await this.prisma.feat.update({
        where: { id },
        data: this.toColumnData(dto) as Prisma.FeatUpdateInput,
      });
    } catch (err) {
      mapWriteError(err, row.contentSource, 'feat');
    }
  }

  async remove(id: string, actor: ContentActor): Promise<void> {
    const row = await this.findWritableRow(id, actor);
    try {
      await this.prisma.feat.delete({ where: { id } });
    } catch (err) {
      mapWriteError(err, row.contentSource, 'feat');
    }
  }

  /**
   * Load the row and authorize the write. Rows the actor cannot even read
   * (someone else's homebrew) 404 rather than 403 so their existence does not
   * leak; visible-but-immutable rows (SRD, shared for non-admins) 403.
   */
  private async findWritableRow(id: string, actor: ContentActor): Promise<Feat> {
    const row = await this.prisma.feat.findUnique({ where: { id } });
    if (!row || !this.contentAccess.canRead(row, actor.userId)) {
      throw new NotFoundException('Feat not found');
    }
    this.contentAccess.assertWritable(row, actor);
    return row;
  }

  /**
   * Map a DTO onto Prisma column data, dropping anything that is not a plain
   * feat column — ownership/tier/source fields can never be set by clients,
   * even if a raw payload sneaks past DTO validation. `repeatable` is a
   * non-nullable column, so a null clear (the client's way of resetting an
   * optional field, VEG-316) becomes its false default; `benefits` is a
   * nullable Json column, where Prisma requires an explicit DbNull instead of
   * plain null. Blank `prerequisite`/`category` strings (reachable only via
   * raw API writes — the form already clears to null) normalize to null so
   * the hasPrerequisite/category filters cannot mis-bucket them.
   */
  private toColumnData(dto: CreateFeatDto | UpdateFeatDto): Record<string, unknown> {
    const {
      contentSource: _contentSource,
      createdById: _createdById,
      campaignId: _campaignId,
      source: _source,
      id: _id,
      ...data
    } = dto as Record<string, unknown>;
    if ('repeatable' in data && data.repeatable === null) data.repeatable = false;
    if ('benefits' in data && data.benefits === null) data.benefits = Prisma.DbNull;
    if (typeof data.prerequisite === 'string' && !data.prerequisite.trim()) {
      data.prerequisite = null;
    }
    if (typeof data.category === 'string' && !data.category.trim()) data.category = null;
    return data;
  }
}
