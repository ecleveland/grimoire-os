import { Injectable, Logger } from '@nestjs/common';
import type { GearMeta } from '@grimoire-os/shared';
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
 * `InventoryItem`: the request-side `GearMetaDto` declares `type` as a plain
 * string (class-validator can't switch DTO classes on a discriminant, so
 * `@IsIn(['armor','weapon'])` does that work at runtime), which means the DTO
 * doesn't satisfy the shared `GearMeta` union. `gear` is `unknown` because
 * resolution only ever presence-tests it — it never reads the snapshot.
 */
type ResolvableLine = {
  name: string;
  itemId?: string;
  gear?: unknown;
};

/**
 * What resolution contributes on top of the caller's own line shape. `gear`
 * keeps the caller's type as an alternative because a passed-through line
 * carries whatever it arrived with — narrowing it to `GearMeta` would be
 * asserting a union onto a value this code deliberately never inspects.
 */
type Resolved<T extends ResolvableLine> = T & {
  itemId?: string;
  gear?: T['gear'] | GearMeta;
};

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
 * Fill is additive and per-field: an existing `gear` snapshot is never
 * rewritten, so the snapshot-at-pick-time contract VEG-410 established still
 * holds, but a line that snapshotted without linking still gains its `itemId`.
 * A fully-resolved payload round-trips unchanged.
 *
 * Only `create` runs this — on update the server can't tell a newly-typed line
 * from one the user deliberately renamed or detached, and re-resolving would
 * resurrect gear they had removed.
 *
 * Note there is no try/catch: a resolution failure fails the whole create,
 * deliberately. Create is the only resolution point — there is no backfill job
 * and no re-resolve on update — so a character saved during a transient DB
 * fault would be silently and permanently wrong on the sheet. Failing costs the
 * user one retry; degrading costs them a character they may not notice is wrong
 * for sessions. Revisit only if a backfill/relink path is ever added.
 */
@Injectable()
export class InventoryResolverService {
  private readonly logger = new Logger(InventoryResolverService.name);
  private catalog: CatalogIndex | null = null;
  private warnedEmptyCatalog = false;

  constructor(private prisma: PrismaService) {}

  async resolveInventory<T extends ResolvableLine>(inventory: T[]): Promise<Resolved<T>[]> {
    // Query avoidance only: `resolveLine` re-checks each line independently, so
    // this is safe to skip when every line is already fully resolved.
    const needsResolution = inventory.some(line => !line.gear || !line.itemId);
    if (!needsResolution) return inventory;

    const catalog = await this.loadCatalog();
    return inventory.map(line => this.resolveLine(line, catalog));
  }

  private resolveLine<T extends ResolvableLine>(line: T, catalog: CatalogIndex): Resolved<T> {
    if (line.gear && line.itemId) return line;

    // A link the client already made is authoritative over the display name,
    // which it may have edited freely.
    const match = line.itemId
      ? catalog.byId.get(line.itemId)
      : lookupItemByName(catalog.byName, line.name);
    if (!match) return line;

    // Per-field: the client's snapshot wins where it exists, and `equipped` is
    // left exactly as sent — auto-equipping starting armor is a rules decision
    // (a Cleric wants mail + shield equipped; a Fighter with two martial
    // weapons does not) tracked separately.
    const gear = line.gear ?? gearMetaFromItem(match) ?? undefined;
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
   * than everyone else, from an identical build.
   *
   * Cached for the process lifetime with no invalidation hook. srd rows are
   * immutable *through the API* (`ContentAccessService.assertWritable` rejects
   * them), but `npm run seed` mutates them out of band from a separate process,
   * so reseeding against a running backend needs a restart to pick up added or
   * retired rows. An empty result is never cached — otherwise a process that
   * booted before the first seed would resolve nothing until restarted.
   */
  private async loadCatalog(): Promise<CatalogIndex> {
    if (this.catalog) return this.catalog;

    // No cast: the Prisma payload is structurally assignable, and letting the
    // compiler check it is what catches a column whose *type* drifts (an
    // `Int?` → `String?` migration would otherwise be asserted straight past
    // `GearSourceItem` into a silently-wrong snapshot).
    const rows: ResolvableItem[] = await this.prisma.item.findMany({
      where: { contentSource: 'srd' },
      select: RESOLVABLE_ITEM_SELECT,
    });

    const catalog: CatalogIndex = {
      byName: buildItemNameIndex(rows, name =>
        this.logger.warn(
          `Ambiguous srd item name "${name}" — multiple catalog rows fold to it, so ` +
            `starting-equipment lines using it will save with no catalog link or gear snapshot.`
        )
      ),
      byId: new Map(rows.map(row => [row.id, row])),
    };

    if (rows.length === 0) {
      // Warned once, not per create: an unseeded catalog means every character
      // built meanwhile saves permanently gear-less, and because resolution is
      // create-only, running the seed afterwards repairs none of them.
      if (!this.warnedEmptyCatalog) {
        this.warnedEmptyCatalog = true;
        this.logger.warn(
          'SRD item catalog is empty — starting equipment will save with no catalog links or ' +
            'gear snapshots, and resolution does not re-run on update. Run the backend seed.'
        );
      }
      return catalog;
    }

    this.catalog = catalog;
    return catalog;
  }
}
