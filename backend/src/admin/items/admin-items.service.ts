import { BadRequestException, Injectable } from '@nestjs/common';
import { Item, Prisma } from '@prisma/client';
import { ContentActor } from '../../srd/content-access.service';
import { ColumnData, ContentCrudService, ContentWriteDelegate } from '../../srd/content-crud.base';
import { mapWriteError, toItemColumnData } from '../../srd/homebrew-write.helpers';
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
 * The write path is the shared {@link ContentCrudService} skeleton, exactly as
 * {@link HomebrewItemsService} uses it; only the tier differs (`shared`,
 * admin-only, which the base derives the `source` label from) and
 * bundle-contents editing is added on top.
 */
@Injectable()
export class AdminItemsService extends ContentCrudService<Item, CreateItemDto, UpdateItemDto> {
  protected readonly tier = 'shared' as const;
  protected readonly noun = 'item';

  protected get delegate(): ContentWriteDelegate<Item> {
    return this.prisma.item;
  }

  protected toColumnData(dto: CreateItemDto | UpdateItemDto): ColumnData {
    return toItemColumnData(dto);
  }

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
    // findWritableRow authorizes the write but says nothing about the tier, and
    // `category` is a free-form string: an admin can create their own homebrew
    // item called an Equipment Pack and own it, which passes the guard. Bundle
    // contents only make sense on a globally visible row, since every viewer of
    // the pack has to resolve its components, so pin the tier explicitly rather
    // than inferring it from who was allowed to write.
    if (bundle.contentSource !== 'shared') {
      throw new BadRequestException('Only shared-tier equipment packs can have contents');
    }
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
      // Tier from the loaded row, never a literal: the same rule the write
      // skeleton follows, so this path cannot drift from it.
      mapWriteError(err, bundle.contentSource, 'item');
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
}
