import { Injectable, NotFoundException } from '@nestjs/common';
import { Item, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentAccessService, ContentActor } from './content-access.service';
import { HOMEBREW_SOURCE_LABEL, mapWriteError } from './homebrew-write.helpers';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

/**
 * CRUD for user-authored (homebrew) items (VEG-296), following the
 * {@link HomebrewSpellsService} pattern. Authorization is delegated to
 * {@link ContentAccessService}: any authenticated user may create homebrew for
 * themselves; rows are writable per their tier (owner for homebrew, admins for
 * shared, never for SRD).
 */
@Injectable()
export class HomebrewItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentAccess: ContentAccessService
  ) {}

  async create(dto: CreateItemDto, actor: ContentActor): Promise<Item> {
    this.contentAccess.assertCanCreate('homebrew', actor);

    try {
      return await this.prisma.item.create({
        data: {
          ...this.toColumnData(dto),
          source: HOMEBREW_SOURCE_LABEL,
          contentSource: 'homebrew',
          createdById: actor.userId,
        } as Prisma.ItemUncheckedCreateInput,
      });
    } catch (err) {
      mapWriteError(err, 'homebrew', 'item');
    }
  }

  async update(id: string, dto: UpdateItemDto, actor: ContentActor): Promise<Item> {
    const row = await this.findWritableRow(id, actor);

    try {
      return await this.prisma.item.update({
        where: { id },
        data: this.toColumnData(dto) as Prisma.ItemUpdateInput,
      });
    } catch (err) {
      mapWriteError(err, row.contentSource, 'item');
    }
  }

  async remove(id: string, actor: ContentActor): Promise<void> {
    const row = await this.findWritableRow(id, actor);
    try {
      await this.prisma.item.delete({ where: { id } });
    } catch (err) {
      mapWriteError(err, row.contentSource, 'item');
    }
  }

  /**
   * Load the row and authorize the write. Rows the actor cannot even read
   * (someone else's homebrew) 404 rather than 403 so their existence does not
   * leak; visible-but-immutable rows (SRD, shared for non-admins) 403.
   */
  private async findWritableRow(id: string, actor: ContentActor): Promise<Item> {
    const row = await this.prisma.item.findUnique({ where: { id } });
    if (!row || !this.contentAccess.canRead(row, actor.userId)) {
      throw new NotFoundException('Item not found');
    }
    this.contentAccess.assertWritable(row, actor);
    return row;
  }

  /**
   * Map a DTO onto Prisma column data, dropping anything that is not a plain
   * item column — ownership/tier/source fields can never be set by clients,
   * even if a raw payload sneaks past DTO validation. `stealthDisadvantage`,
   * `requiresAttunement`, and `isMagic` are non-nullable columns, so a null
   * clear (the client's way of resetting an optional field, VEG-316) becomes
   * their false default; `properties` likewise resets to its empty-array
   * default. A blank `rarity` string (reachable only via raw API writes — the
   * form already clears to null) normalizes to null so the rarity filter
   * cannot mis-bucket it.
   */
  private toColumnData(dto: CreateItemDto | UpdateItemDto): Record<string, unknown> {
    const {
      contentSource: _contentSource,
      createdById: _createdById,
      campaignId: _campaignId,
      source: _source,
      id: _id,
      ...data
    } = dto as Record<string, unknown>;
    for (const flag of ['stealthDisadvantage', 'requiresAttunement', 'isMagic'] as const) {
      if (flag in data && data[flag] === null) data[flag] = false;
    }
    if ('properties' in data && data.properties === null) data.properties = [];
    if (typeof data.rarity === 'string' && !data.rarity.trim()) data.rarity = null;
    return data;
  }
}
