import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Item, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ContentAccessService, ContentActor } from '../../srd/content-access.service';
import { SHARED_SOURCE_LABEL, mapWriteError } from '../../srd/homebrew-write.helpers';
import { CreateItemDto } from '../../srd/dto/create-item.dto';
import { UpdateItemDto } from '../../srd/dto/update-item.dto';
import { buildPaginatedResponse } from '../../common/helpers/paginate';
import { BundleContentEntryDto } from './dto/set-bundle-contents.dto';

export interface ListItemsQuery {
  q?: string;
  category?: string;
  page?: number;
  limit?: number;
}

/**
 * Admin CRUD for the `shared` tier of the items catalog (VEG-309): equipment
 * packs (with editable bundle contents) and the edge categories
 * (mounts/vehicles, trade goods, food/lodging) the SRD seed leaves static.
 *
 * Everything written here is `contentSource: 'shared'`, which is what makes it
 * reseed-safe: {@link SeedService} only ever touches `contentSource: 'srd'`
 * rows, so admin-authored catalog rows survive a re-seed untouched. SRD rows
 * stay immutable — {@link ContentAccessService.assertWritable} rejects them —
 * so to "edit" a seeded pack an admin recreates it as a shared variant.
 *
 * The write path mirrors {@link HomebrewItemsService}; only the tier differs
 * (`shared`, admin-only) and bundle-contents editing is added on top.
 */
@Injectable()
export class AdminItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contentAccess: ContentAccessService
  ) {}

  /** Paginated list of the shared-tier catalog rows admins manage. */
  async list(query: ListItemsQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ItemWhereInput = { contentSource: 'shared' };
    if (query.category) where.category = query.category;
    if (query.q) where.name = { contains: query.q, mode: 'insensitive' };

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

  async create(dto: CreateItemDto, actor: ContentActor): Promise<Item> {
    this.contentAccess.assertCanCreate('shared', actor);
    try {
      return await this.prisma.item.create({
        data: {
          ...this.toColumnData(dto),
          source: SHARED_SOURCE_LABEL,
          contentSource: 'shared',
          createdById: actor.userId,
        } as Prisma.ItemUncheckedCreateInput,
      });
    } catch (err) {
      mapWriteError(err, 'shared', 'item');
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
   * Replace an equipment pack's bundle contents with the given set (VEG-309).
   * The whole desired set is sent; entries are rewritten delete-then-recreate so
   * the operation is idempotent, exactly like the seed's second bundle pass. The
   * pack must be a writable shared row of category "Equipment Pack"; every
   * component must resolve to a row in the global catalog (srd + shared) so all
   * viewers of the pack can resolve its contents. The application-level checks
   * (self-reference, intra-pack duplicate, component existence) produce friendly
   * 400s; the DB CHECKs (quantity >= 1 via the DTO, bundleId <> componentId,
   * uniqueness) are a backstop, and a component deleted between the existence
   * check and the write (an FK race) is mapped to a 400 rather than a raw 500.
   */
  async setBundleContents(id: string, entries: BundleContentEntryDto[], actor: ContentActor) {
    const bundle = await this.findWritableRow(id, actor);
    if (bundle.category !== 'Equipment Pack') {
      throw new BadRequestException('Only equipment packs can have contents');
    }

    if (entries.some(e => e.itemId === id)) {
      throw new BadRequestException('A pack cannot contain itself');
    }
    const ids = entries.map(e => e.itemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('A component can only be listed once per pack');
    }

    // Resolve component names and confirm every component is globally visible.
    const components = ids.length
      ? await this.prisma.item.findMany({
          where: { id: { in: ids }, ...this.contentAccess.globalWhere() },
          select: { id: true, name: true },
        })
      : [];
    if (components.length !== ids.length) {
      throw new BadRequestException('One or more components were not found in the catalog');
    }
    const nameById = new Map(components.map(c => [c.id, c.name]));

    try {
      await this.prisma.$transaction(async tx => {
        await tx.itemBundleEntry.deleteMany({ where: { bundleId: id } });
        if (entries.length) {
          await tx.itemBundleEntry.createMany({
            data: entries.map(e => ({
              bundleId: id,
              componentId: e.itemId,
              quantity: e.quantity,
            })),
          });
        }
      });
    } catch (err) {
      // A component (or the pack) deleted between the visibility check above and
      // the write trips a foreign-key violation (P2003). Surface it as an
      // actionable 400 instead of an opaque 500; everything else (P2002/P2025)
      // goes through the shared write-error mapping for consistent semantics.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
        throw new BadRequestException(
          'One or more components were removed while saving; refresh and try again'
        );
      }
      mapWriteError(err, 'shared', 'item');
    }

    return {
      ...bundle,
      contents: entries.map(e => ({
        itemId: e.itemId,
        name: nameById.get(e.itemId) as string,
        quantity: e.quantity,
      })),
    };
  }

  /**
   * Load the row and authorize the write. Rows the actor cannot read 404 (no
   * existence leak); visible-but-immutable rows (SRD, or shared for non-admins)
   * 403 — see {@link ContentAccessService.assertWritable}.
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
   * Map a DTO onto Prisma column data, dropping ownership/tier/source fields a
   * client must never set and coercing nullable-clears on the non-nullable
   * columns — the same normalization {@link HomebrewItemsService} applies.
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
