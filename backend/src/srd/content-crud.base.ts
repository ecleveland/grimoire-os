import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import type { ContentSource } from '@grimoire-os/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ContentAccessService, ContentActor, OwnedContentRow } from './content-access.service';
import {
  HOMEBREW_SOURCE_LABEL,
  SHARED_SOURCE_LABEL,
  mapWriteError,
  notFoundMessage,
} from './homebrew-write.helpers';

/** Normalized Prisma column data, post-`toColumnData` and pre-ownership stamp. */
export type ColumnData = Record<string, unknown>;

/**
 * Tiers a CRUD service may write. `srd` is excluded at the type level because
 * only the seed creates SRD rows; {@link ContentAccessService.assertCanCreate}
 * rejects it at runtime, and this keeps a subclass from asking in the first place.
 */
export type WritableTier = Exclude<ContentSource, 'srd'>;

/**
 * The slice of a Prisma model delegate the write skeleton needs. Every generated
 * delegate (`prisma.monster`, `prisma.spell`, ...) satisfies this structurally
 * with no cast: the delegates declare their operations with method syntax, whose
 * parameters check bivariantly, so the loose {@link ColumnData} is accepted where
 * the generated `XUncheckedCreateInput` is expected. The row type is still
 * enforced, so `ContentWriteDelegate<Monster> = prisma.spell` is a compile error.
 *
 * This concentrates looseness rather than adding it: before this base existed,
 * every service cast its payload at each call site (`as Prisma.SpellUpdateInput`
 * and friends). Those casts are gone; the one loose seam left is audited here and
 * exercised by `content-write.contract.spec.ts` against all six services.
 */
export interface ContentWriteDelegate<Row> {
  findUnique(args: { where: { id: string } }): Promise<Row | null>;
  create(args: { data: ColumnData }): Promise<Row>;
  update(args: { where: { id: string }; data: ColumnData }): Promise<Row>;
  delete(args: { where: { id: string } }): Promise<Row>;
}

/**
 * Columns a client may never set on a tiered row: they decide ownership, tier,
 * provenance and identity.
 */
interface ReservedColumns extends OwnedContentRow {
  campaignId: string | null;
  source: string;
  id: string;
}

/**
 * The reserved set, derived from a type rather than written as loose strings.
 * A typo (`contentSourc`) is an excess-property error and a dropped entry fails
 * the `Record`, which matters because this list IS the tier defense on the
 * update path: a silently misspelled key would let the column through.
 */
const RESERVED_SET: Record<keyof ReservedColumns, true> = {
  contentSource: true,
  createdById: true,
  campaignId: true,
  source: true,
  id: true,
};

/**
 * Prisma relation aliases that write a reserved column by another name.
 *
 * The scalar deny-list above is derived from the row type, but a checked write
 * input also accepts the relation form: `createdBy: { connect: { id } }` sets
 * `createdById` without the string 'createdById' ever appearing in the payload.
 * `ColumnData` is `Record<string, unknown>`, so nothing else would stop it.
 *
 * Over HTTP the DTO layer rejects it first (`forbidNonWhitelisted`), but this
 * strip is documented as the defense, and a seed, import or other internal
 * caller is not behind that pipe. Only `createdById` has an alias on the tiered
 * models; `campaignId` has no relation field on them.
 */
const RESERVED_RELATIONS = ['createdBy'] as const;

const RESERVED_COLUMNS = [...Object.keys(RESERVED_SET), ...RESERVED_RELATIONS] as string[];

/** The ownership fields a create forces onto every row, whatever the client sent. */
interface OwnershipStamp {
  source: string;
  contentSource: WritableTier;
  createdById: string;
}

/** Every writable tier's `source` label. Total, so a new tier must declare one. */
const SOURCE_LABEL_BY_TIER: Record<WritableTier, string> = {
  homebrew: HOMEBREW_SOURCE_LABEL,
  shared: SHARED_SOURCE_LABEL,
};

/**
 * Drop the reserved columns from a write payload, in place.
 *
 * The ownership stamp forces only `source`, `contentSource` and `createdById`,
 * so even on create this is the sole defense for `id` and `campaignId`. On
 * update it is the sole defense for all five: an update applies no stamp,
 * so without this strip a payload carrying `contentSource: 'srd'` would
 * escalate a homebrew row out of its owner's tier and into the immutable
 * catalog. That covers what the skeleton hands to
 * {@link ContentCrudService.performUpdate}; an override composing its own
 * payload is trusted to keep the reserved columns off it.
 * Every entity's column mapping used to re-implement this by hand,
 * which made the tier defense a thing five separate authors had to remember.
 * Running it here means an entity mapping can only fail to normalize a column,
 * never fail to protect one.
 */
function stripReservedColumns(data: ColumnData): ColumnData {
  for (const column of RESERVED_COLUMNS) delete data[column];
  return data;
}

/**
 * Re-check the ownership columns on the row a write produced.
 *
 * `performUpdate` hands a subclass the whole write, so the reserved-column strip
 * no longer sees every payload that reaches Prisma: an override composing its own
 * can set `contentSource` or `createdById` and escalate a homebrew row into the
 * immutable catalog. This is the skeleton's last look at the result and it costs
 * two comparisons.
 *
 * It does NOT catch an override that returns the row it read rather than the row
 * it wrote. A stale row carries the same tier and owner by definition, so nothing
 * compared here can distinguish it; that one stays a documented trap on
 * {@link ContentCrudService.performUpdate}.
 */
function assertOwnershipUnchanged<Row extends OwnedContentRow>(
  written: Row,
  authorized: Row,
  noun: string
): Row {
  if (
    written.contentSource !== authorized.contentSource ||
    written.createdById !== authorized.createdById
  ) {
    throw new InternalServerErrorException(
      `Refusing to return a ${noun} whose ownership changed during the write`
    );
  }
  return written;
}

/**
 * The write skeleton every tiered-content CRUD service shares (VEG-336).
 *
 * Monsters, spells, feats, items, backgrounds and the admin shared-tier item
 * writer each used to carry their own byte-for-byte copy of this. That is a
 * security-relevant duplication: the copies are authorization code, and a copy
 * that drifts keeps passing its own spec, because per-clone tests are edited
 * alongside the clone they cover. Holding it once means a fix lands once.
 *
 * Subclasses supply four things (tier, noun, delegate, column mapping) and get
 * the whole authorized sequence. Where an entity genuinely diverges it overrides
 * a hook rather than the skeleton, so the authorization order can never be
 * reordered or skipped by a subclass:
 *
 * - `create`  authorize the tier, map columns, run `beforeCreate`, stamp, write.
 * - `update`  load-and-authorize, map columns, run `beforeUpdate`, `performUpdate`.
 * - `remove`  load-and-authorize, then `performDelete`.
 *
 * Two invariants worth stating because they are easy to break by hand and were
 * paired manually in all six copies:
 *
 * 1. **404 vs 403 is deliberate.** A row the actor cannot even read 404s so its
 *    existence does not leak; a row that is visible but immutable (SRD, or
 *    shared content for a non-admin) 403s. See {@link findWritableRow}.
 * 2. **Mutation errors are keyed to the loaded row's tier, not this service's.**
 *    An admin editing a shared row must get shared-tier conflict copy even from a
 *    homebrew-tier service, so `update`/`remove` pass `row.contentSource` while
 *    only `create` (which has no row yet) passes `this.tier`.
 *
 * The `source` label is derived from the tier rather than declared separately,
 * so the label and `contentSource` cannot be paired inconsistently.
 *
 * Subclasses must not override `create`, `update`, `remove` or
 * `findWritableRow`; an ESLint rule enforces this, since TypeScript has no
 * `final`. Override the hooks instead.
 */
@Injectable()
export abstract class ContentCrudService<
  Row extends OwnedContentRow,
  CreateDto extends object,
  UpdateDto extends object,
> {
  /** The tier every row this service writes is stamped with. */
  protected abstract readonly tier: WritableTier;

  /** Lowercase entity name used in user-facing error copy ('monster', 'spell'). */
  protected abstract readonly noun: string;

  /** The Prisma delegate this service writes through. */
  protected abstract get delegate(): ContentWriteDelegate<Row>;

  /**
   * Normalize a validated DTO into plain column data: copy it so the caller's
   * DTO is never mutated, and coerce the nulls the schema cannot take. An
   * implementation is responsible for normalization ONLY; the reserved
   * ownership and tier columns are stripped by the skeleton afterwards, so
   * forgetting to guard them here cannot open a tier escalation.
   */
  protected abstract toColumnData(dto: CreateDto | UpdateDto): ColumnData;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly contentAccess: ContentAccessService
  ) {}

  async create(dto: CreateDto, actor: ContentActor): Promise<Row> {
    this.contentAccess.assertCanCreate(this.tier, actor);
    const mapped = stripReservedColumns(this.toColumnData(dto));
    // The strip runs again on what the hook RETURNED, not on what it was handed:
    // a hook that builds a replacement object would otherwise slip a reserved
    // column past a guard that only ever inspected the original.
    const data = stripReservedColumns(await this.beforeCreate(mapped, actor));

    // Annotated so a misspelled forced field (`contentSourc`) is a compile
    // error rather than an extra column that silently never gets stamped.
    const stamp: OwnershipStamp = {
      source: this.sourceLabel,
      contentSource: this.tier,
      createdById: actor.userId,
    };

    try {
      // The ownership stamp is spread last so no hook or DTO field can displace it.
      return await this.delegate.create({ data: { ...data, ...stamp } });
    } catch (err) {
      mapWriteError(err, this.tier, this.noun);
    }
  }

  async update(id: string, dto: UpdateDto, actor: ContentActor): Promise<Row> {
    const row = await this.findWritableRow(id, actor);
    // Stripped before the hook as well as after: a hook must never read a
    // reserved column off the request body and mistake it for row state (the
    // loaded `row` is where that belongs), and must never be able to inject one.
    const mapped = stripReservedColumns(this.toColumnData(dto));
    // No stamp on this path, so the strip is the only thing standing between a
    // crafted payload and a tier escalation. It runs on the hook's return value
    // so a replacement object is covered as thoroughly as a mutated one.
    const data = stripReservedColumns(await this.beforeUpdate(mapped, row, actor));

    let written: Row;
    try {
      written = await this.performUpdate(id, data);
    } catch (err) {
      mapWriteError(err, row.contentSource, this.noun);
    }
    // `mapWriteError` returns `never`, so `written` is assigned by here.
    return assertOwnershipUnchanged(written, row, this.noun);
  }

  async remove(id: string, actor: ContentActor): Promise<void> {
    const row = await this.findWritableRow(id, actor);
    try {
      await this.performDelete(id);
    } catch (err) {
      mapWriteError(err, row.contentSource, this.noun);
    }
  }

  /**
   * Load the row and authorize the write. Rows the actor cannot read (someone
   * else's homebrew) 404 rather than 403 so their existence does not leak;
   * visible-but-immutable rows (SRD, shared for non-admins) 403.
   *
   * Protected rather than private because a subclass that adds its own write
   * methods authorizes through it too (see `AdminItemsService.setBundleContents`).
   */
  protected async findWritableRow(id: string, actor: ContentActor): Promise<Row> {
    const row = await this.delegate.findUnique({ where: { id } });
    if (!row || !this.contentAccess.canRead(row, actor.userId)) {
      throw new NotFoundException(notFoundMessage(this.noun));
    }
    this.contentAccess.assertWritable(row, actor);
    return row;
  }

  /**
   * Last chance to adjust column data before a create is stamped and written.
   * Runs after authorization, so a guard here cannot be reached by an actor who
   * may not create at this tier. Async because guards may hit the database.
   *
   * Returns the data rather than mutating it in place: an override written in
   * the natural immutable style (`data = { ...data, x }`) reassigns its own
   * parameter, so under a `void` return it compiled, ran, and silently changed
   * nothing. Forgetting to return is now a compile error. Mutating and returning
   * the same object stays valid.
   */
  protected beforeCreate(data: ColumnData, _actor: ContentActor): ColumnData | Promise<ColumnData> {
    return data;
  }

  /**
   * Last chance to adjust column data before an update is written. Receives the
   * already-authorized row so row-aware invariants can compare old against new.
   * Returns its data for the reason given on {@link beforeCreate}.
   */
  protected beforeUpdate(
    data: ColumnData,
    _row: Row,
    _actor: ContentActor
  ): ColumnData | Promise<ColumnData> {
    return data;
  }

  /**
   * How this entity's update reaches the database. Override when the update has
   * to span child rows, replacing a class's per-level features say, and do it in
   * one transaction so a failure cannot leave the parent updated and the children
   * half-rewritten. Without this seam the only way to get a transaction was to
   * authorize via {@link findWritableRow} and then write outside the skeleton,
   * which is how per-service error-mapping drift gets back in.
   *
   * Takes no tier or noun, so an override cannot hand-roll the tier-keyed copy
   * for its own P2002/P2025; `update` maps the failure with the loaded row's
   * tier. An override that writes child rows should catch and translate their
   * conflicts itself, since that mapping keys everything to the parent noun and
   * a duplicate child would surface as a duplicate parent. Anything already an
   * HttpException passes through `mapWriteError` untouched.
   *
   * The hook receives `id` and `data` and nothing else. The authorized `row` is
   * a local of `update`, so an override that needs the old state must re-read it.
   * Do not stash it on `this` from `beforeUpdate`: providers are singletons, and
   * two concurrent updates would overwrite each other's stash.
   *
   * Return the row the write produced. `update` hands this value straight back to
   * its caller, so it is what the response body carries, and an override that
   * re-read the row has both values to hand as `Row`. Returning the pre-write one
   * serves the client the state it just replaced. The ownership re-check on the
   * way out cannot catch that: a stale row carries the same tier and owner.
   */
  protected async performUpdate(id: string, data: ColumnData): Promise<Row> {
    return this.delegate.update({ where: { id }, data });
  }

  /**
   * How this entity is deleted. Override when deletion needs referential cleanup
   * that the schema's FK rules do not cover on their own, and do the cleanup in
   * the same transaction as the delete so a failure cannot half-update
   * referencing rows. `HomebrewFeatsService` is the worked example: a SET NULL FK
   * nulls only the id and would strand the sibling column (VEG-431).
   *
   * Takes no tier or noun, so an override cannot hand-roll its own error copy;
   * `remove` maps the failure with the loaded row's tier.
   */
  protected async performDelete(id: string): Promise<void> {
    await this.delegate.delete({ where: { id } });
  }

  /**
   * Display label for the legacy `source` column, derived from the tier so the
   * two cannot be paired inconsistently. A total map rather than a ternary:
   * `WritableTier` widens automatically if `ContentSource` gains a member (the
   * schema already reserves `campaignId` for per-campaign scoping), and a
   * ternary's else branch would silently label a new tier "Homebrew" where a
   * missing key here fails to compile.
   */
  private get sourceLabel(): string {
    return SOURCE_LABEL_BY_TIER[this.tier];
  }
}
