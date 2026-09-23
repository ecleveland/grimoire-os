import { Prisma } from '@prisma/client';

/**
 * Escape the LIKE metacharacters Postgres honours in a value bound to ILIKE.
 * Backslash first, or it would re-escape the escapes it just added.
 *
 * THE ESCAPING IS LOAD-BEARING, and this file is the one account of why.
 *
 * Prisma compiles `mode: 'insensitive'` to `name ILIKE $1` and binds the value
 * as a *pattern*, not a string, and a hand-written ILIKE does the same. Measured
 * against the dev database on Prisma 6.19.2: `equals: 'Fighte_'` returned the
 * SRD Fighter, `equals: 'Wiz%'` returned Wizard, and `equals: '%'` returned
 * every class. A character free-typed as "Wizar_" would have had the SRD
 * Wizard's id derived and written to `classId` permanently, granting a real
 * class's spell slots to a class that does not exist. The same characters reach
 * a free-text search box far more often (VEG-529), where `q=%` listed the whole
 * catalog, `q=_` matched any single character, and a name holding a `%` or `_`
 * could not be searched for at all. A value ending in a backslash is worse
 * still: where nothing follows it, Postgres raises 22025 ("LIKE pattern must not
 * end with escape character") mid-scan, which surfaces as a 500.
 *
 * Postgres reads the default LIKE escape character as a backslash, so no ESCAPE
 * clause is needed anywhere these are used.
 *
 * Exported because it is only correct if there is exactly one copy.
 */
export const escapeLike = (value: string) =>
  value.replace(/[\\%_]/g, character => `\\${character}`);

/**
 * Prisma `contains` filter matching a value literally, case-insensitively. The
 * filter almost every free-text search wants.
 */
export const containsInsensitive = (value: string) => ({
  contains: escapeLike(value),
  mode: Prisma.QueryMode.insensitive,
});

/**
 * Prisma `equals` filter matching a value literally, case-insensitively. Still a
 * pattern under the hood, which is the whole trap: `equals: '%'` matches every
 * row. `catalogNameWhere` is the caller.
 */
export const equalsInsensitive = (value: string) => ({
  equals: escapeLike(value),
  mode: Prisma.QueryMode.insensitive,
});

/**
 * The `%...%` pattern for a hand-written ILIKE, with the value's metacharacters
 * escaped. The raw-SQL counterpart of `containsInsensitive`: only the wrapping
 * wildcards are meant as wildcards.
 */
export const likeContainsPattern = (value: string) => `%${escapeLike(value)}%`;
