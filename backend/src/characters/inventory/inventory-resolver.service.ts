import { Injectable } from '@nestjs/common';
import type { GearMeta, InventoryItem } from '@grimoire-os/shared';
import { gearMetaFromItem } from '@grimoire-os/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RESOLVABLE_ITEM_SELECT,
  ResolvableItem,
  buildItemNameIndex,
  lookupItemByName,
} from './item-name-match';

/**
 * The subset of an inventory line resolution reads. Deliberately looser than
 * `InventoryItem`: the request-side `InventoryItemDto` declares `gear.type` as
 * a plain string (class-validator can't switch DTO classes on a discriminant),
 * so it doesn't satisfy the shared union. Only presence is checked here, never
 * the snapshot's contents.
 */
type ResolvableLine = {
  name: string;
  itemId?: string;
  gear?: object;
};

/** What resolution contributes on top of the caller's own line shape. */
type Resolved<T> = T & Pick<InventoryItem, 'itemId' | 'gear'>;

type CatalogIndex = {
  byName: Map<string, ResolvableItem>;
  byId: Map<string, ResolvableItem>;
};

/**
 * Backfills catalog links and gear snapshots onto inventory lines at character
 * create time (VEG-462).
 *
 * The guided builder emits starting equipment as bare `{name, quantity}` — it
 * has no catalog lookup — so a freshly-built Fighter's chain mail carried no
 * `gear` and contributed nothing to derived AC. Doing this at the create
 * chokepoint rather than in the builder fixes the classic editor and API
 * clients in the same stroke.
 *
 * Fill is strictly additive: an existing `gear` snapshot is never rewritten,
 * so the snapshot-at-pick-time contract VEG-410 established still holds and a
 * pre-resolved payload round-trips unchanged. Only `create` runs this — on
 * update the server can't tell a newly-typed line from one the user
 * deliberately renamed or detached, and re-resolving would resurrect gear they
 * had removed.
 */
@Injectable()
export class InventoryResolverService {
  private catalog: CatalogIndex | null = null;

  constructor(private prisma: PrismaService) {}

  async resolveInventory<T extends ResolvableLine>(inventory: T[]): Promise<Resolved<T>[]> {
    const needsResolution = inventory.some(line => !line.gear);
    if (!needsResolution) return inventory as Resolved<T>[];

    const catalog = await this.loadCatalog();
    return inventory.map(line => this.resolveLine(line, catalog));
  }

  private resolveLine<T extends ResolvableLine>(line: T, catalog: CatalogIndex): Resolved<T> {
    if (line.gear) return line as Resolved<T>;

    // A link the client already made is authoritative over the display name,
    // which it may have edited freely.
    const match = line.itemId
      ? catalog.byId.get(line.itemId)
      : lookupItemByName(catalog.byName, line.name);
    if (!match) return line as Resolved<T>;

    const gear: GearMeta | null = gearMetaFromItem(match);
    return {
      ...line,
      itemId: match.id,
      // Set conditionally — the line is persisted as JSON and validated by a
      // whitelist DTO, so a present-but-undefined key is not the same as absent.
      ...(gear ? { gear } : {}),
    };
  }

  /**
   * Load and memoize the srd-tier catalog.
   *
   * Scoped to `contentSource: 'srd'` because these names originate in the
   * server's own seed data and therefore denote srd rows by construction.
   * Widening to `shared`/`homebrew` would make resolution user-dependent: a
   * user with a homebrew row named "Shield" would get different starting gear
   * than everyone else, from an identical build. srd rows are immutable, so
   * the index is safe to hold for the process lifetime — but an empty result
   * is never cached, or a process that booted before the seed ran would
   * resolve nothing until restarted.
   */
  private async loadCatalog(): Promise<CatalogIndex> {
    if (this.catalog) return this.catalog;

    const rows = (await this.prisma.item.findMany({
      where: { contentSource: 'srd' },
      select: RESOLVABLE_ITEM_SELECT,
    })) as ResolvableItem[];

    const catalog: CatalogIndex = {
      byName: buildItemNameIndex(rows),
      byId: new Map(rows.map(row => [row.id, row])),
    };
    if (rows.length > 0) this.catalog = catalog;
    return catalog;
  }
}
