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
 * `createdById` and (for a subclass) `classId` (VEG-505), while the feature
 * tables key on `[parentId, name, level]`. Prisma reports the field names rather
 * than the index name — verified against a live Postgres, where the duplicate
 * raises `meta.target = ['classId','name','level']` — so this reads the same list
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
 * one becomes the empty string rather than reaching Prisma as undefined — a
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
  // key on the payload would ride through to the insert — `id` most of all,
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
