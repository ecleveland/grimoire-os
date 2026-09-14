import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { classFeatureIdentity } from '@grimoire-os/shared';
import { ColumnData } from './content-crud.base';
import { ClassFeatureDto } from './dto/create-class.dto';

/**
 * Per-level feature rows, shared by the class and subclass write paths.
 *
 * `ClassFeature` and `SubclassFeature` are the same table twice over: same
 * columns, same `[parentId, name, level]` unique key, same NOT NULL description.
 * The two services therefore need the same five rules, and a second copy of them
 * is a copy of the (name, level) conflict translation, the part that decides
 * whether a duplicate feature is reported as a duplicate feature or as a
 * duplicate parent.
 */

/** Copy for a repeated (name, level) pairing, shared by every write path. */
export const DUPLICATE_FEATURE_MESSAGE =
  'Two features share a name at the same level; each pairing must be unique';

/** A normalized feature row, parent id excluded. */
export interface FeatureRow {
  name: string;
  level: number;
  description: string;
}

/**
 * Pull the normalized feature list off column data, leaving the parent columns
 * behind. `undefined` means the request said nothing about features; an array
 * (possibly empty) means replace the lot.
 *
 * Mutates rather than returning a copy so there is exactly one object in play:
 * a `{ rest, features }` split would leave the caller free to write the wrong
 * half, and `features` reaching the parent's `update` as a column is a Prisma
 * error at best and a silent nested write at worst.
 */
export function takeFeatures(data: ColumnData): FeatureRow[] | undefined {
  const rows = data.features;
  // Always drop the key, even when the value is undefined: `features` reaching
  // the parent's `update` as a scalar column is a Prisma error at best and a
  // silent nested write at worst, and an undefined own-key is still an own key.
  delete data.features;
  return rows === undefined ? undefined : (rows as FeatureRow[]);
}

/**
 * Whether a Prisma error is a unique violation on a feature table's index
 * rather than on the parent's name.
 *
 * `level` is the discriminator because none of the parent-name indexes carry it:
 * the partial uniques on `srd_classes` and `subclasses` key on `name`,
 * `createdById` and (for a subclass) `classId`, while the feature
 * tables key on `[parentId, name, level]`. Prisma reports the field names rather
 * than the index name. Verified against a live Postgres, where the duplicate
 * raises `meta.target = ['classId','name','level']`, so this reads the same list
 * the unit specs construct.
 */
export function isFeatureConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  return Array.isArray(target) && target.includes('level');
}

/**
 * Refuse a feature list that repeats a (name, level) pairing.
 *
 * Mirrors the DTO's `@ArrayUnique`, for the callers that never meet it, down to
 * running the same `classFeatureIdentity` the DTO and the editor use. Same
 * copy as the conflict `performUpdate` translates, so the two write paths answer
 * a duplicate feature identically instead of one of them blaming the parent.
 */
export function assertNoDuplicateFeatures(rows: FeatureRow[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const key = classFeatureIdentity(row);
    if (seen.has(key)) throw new ConflictException(DUPLICATE_FEATURE_MESSAGE);
    seen.add(key);
  }
}

/**
 * Normalize a DTO's feature list into insertable rows.
 *
 * `description` is optional on the DTO and NOT NULL on the column, so a missing
 * one becomes the empty string rather than reaching Prisma as undefined. A
 * half-drafted feature is a real state and should not need invented prose. A
 * null list clears every row, matching the `String[]` null-clear convention.
 *
 * Order is preserved from the payload but is not load-bearing: every read path
 * sorts by `(level, name)`.
 */
export function toFeatureRows(value: ClassFeatureDto[] | null | undefined): FeatureRow[] {
  if (!value) return [];
  // Named fields, not a spread. A spread into an object literal skips
  // excess-property checking, so `tsc` cannot tell the two apart and any extra
  // key on the payload would ride through to the insert, `id` most of all,
  // which would let a caller choose a row's primary key. The DTO already
  // refuses both over HTTP; this is the copy of that rule that a seed or import
  // caller, which the write skeleton documents as bypassing the pipe, still
  // meets.
  return value.map(f => ({
    name: f.name,
    level: f.level,
    description: f.description ?? '',
  }));
}

/** The column on each feature table that points at its parent. */
export type FeatureParentKey = 'classId' | 'subclassId';

/**
 * The slice of a feature table's Prisma delegate that {@link replaceFeatures}
 * needs. `tx.classFeature` satisfies it for `'classId'` and `tx.subclassFeature`
 * for `'subclassId'`, structurally, the way every model delegate satisfies
 * `ContentWriteDelegate`. Keyed on the parent column so handing the class table
 * the subclass key is a compile error rather than a delete scoped to nothing.
 */
export interface FeatureChildDelegate<K extends FeatureParentKey> {
  deleteMany(args: { where: Record<K, string> }): Promise<unknown>;
  createMany(args: { data: (FeatureRow & Record<K, string>)[] }): Promise<unknown>;
}

/**
 * Reshape the normalized feature list on create data into Prisma's nested-create
 * form, in place.
 *
 * An absent `features` key stays absent, so a create that says nothing about
 * features writes no child rows rather than an empty relation. A duplicate
 * (name, level) is refused here, before the write, because `create` is final and
 * the skeleton maps every failure from it with the parent's noun: a P2002 from
 * the nested insert would reach the client as "you already have a class with
 * this name", a message about the wrong entity, with no seam to translate it
 * afterwards. The DTO's `@ArrayUnique` makes that unreachable over HTTP; seed and
 * import callers sit outside that pipe.
 *
 * Not done in `toColumnData`, which cannot tell a create from an update: the
 * update path needs the rows as a plain array for {@link replaceFeatures}, and a
 * nested `create` there would append to the existing rows instead of replacing
 * them.
 */
export function nestFeaturesForCreate(data: ColumnData): void {
  const features = takeFeatures(data);
  if (!features) return;
  assertNoDuplicateFeatures(features);
  data.features = { create: features };
}

/** The table behind each feature parent, for the row lock. A closed set, never input. */
export type FeatureParentTable = 'srd_classes' | 'subclasses';

/** The slice of a transaction client {@link lockFeatureParent} needs. */
export interface RowLocker {
  $queryRaw(query: Prisma.Sql): Promise<unknown>;
}

/**
 * Take a row lock on a feature parent for the rest of the transaction.
 *
 * A replacement is a delete of the parent's rows plus an insert, and nothing else
 * in it locks the parent. A features-only PATCH leaves the parent's column data
 * empty, and Prisma runs `update({ data: {} })` as a plain SELECT, so two
 * overlapping replacements under READ COMMITTED do not wait for each other at
 * the parent. The second one's delete waits on the first one's deleted rows,
 * then cannot see the first one's insert and deletes nothing, so the parent ends
 * up with both lists. When the lists share a (name, level) the second insert
 * hits the unique index instead, and the author gets a conflict for a payload
 * with no duplicates in it.
 *
 * `FOR UPDATE` on the parent row makes the second transaction wait for the first
 * to commit, so its delete then sees and removes the first one's rows. Call it
 * first inside the `$transaction`, before the parent update. The table name comes
 * from the closed {@link FeatureParentTable} union through `Prisma.raw`, and the
 * id is a bound parameter.
 */
export async function lockFeatureParent(
  tx: RowLocker,
  table: FeatureParentTable,
  id: string
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE "id" = ${id} FOR UPDATE`
  );
}

/**
 * Replace every feature row under one parent: delete them all, then insert the
 * new list.
 *
 * Call it with the transaction client's delegate, inside the same `$transaction`
 * as the parent's update, after {@link lockFeatureParent}. The atomicity is the
 * transaction's: without it a failure between the delete and the insert leaves
 * the parent with no features at all, having been asked to change two of them.
 * The serialization is the lock's: without it two overlapping replacements can
 * merge.
 *
 * Delete-then-insert rather than a diff, because a row's only natural key is
 * `(name, level)`, so a rename is indistinguishable from a delete plus an add and
 * any merge would have to guess which the author meant. Feature ids are therefore
 * not stable across a write.
 */
export async function replaceFeatures<K extends FeatureParentKey>(
  children: FeatureChildDelegate<K>,
  parentKey: K,
  parentId: string,
  rows: FeatureRow[]
): Promise<void> {
  // Cast once: TypeScript widens a computed key of a generic type to a string
  // index, so it cannot see that `{ [parentKey]: parentId }` has exactly key K.
  const parent = { [parentKey]: parentId } as Record<K, string>;

  await children.deleteMany({ where: parent });
  if (rows.length === 0) return;
  try {
    await children.createMany({
      // The parent key last so a row cannot override it. `toFeatureRows` builds
      // each row from three named fields, so a stray key never reaches here from
      // a DTO; this keeps the question local rather than two functions away.
      data: rows.map(row => ({ ...row, ...parent })),
    });
  } catch (err) {
    // A backstop, as long as the caller holds the parent lock. The DTO's
    // @ArrayUnique rejects a repeated (name, level), and the deleteMany above
    // clears the parent's other rows, but that clearing only holds when no
    // overlapping replacement can insert between it and this statement, which
    // is what the lock rules out. Without the lock, two overlapping requests whose
    // lists share a pairing reach this catch. Kept either way because the write
    // skeleton maps every failure with the parent's noun, so without this a
    // duplicate *feature* would reach the client as a duplicate parent name.
    // Anything already an HttpException passes through `mapWriteError` untouched.
    if (isFeatureConflict(err)) {
      throw new ConflictException(DUPLICATE_FEATURE_MESSAGE);
    }
    throw err;
  }
}
