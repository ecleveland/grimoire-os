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
 * could not be searched for at all. A value ending in a backslash is the quiet
 * one: the dangling escape swallows whatever follows it, so the query silently
 * becomes a different query. Measured on Postgres 16.13, it does not raise
 * 22025 ("LIKE pattern must not end with escape character") as older notes here
 * claimed: `'Blood' ILIKE 'Blood\'` returns false, with or without an explicit
 * ESCAPE clause. A wrong answer, not a 500.
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
 * Prisma `startsWith` filter matching a value literally, case-insensitively. The
 * prefix match a type-ahead wants.
 *
 * No caller yet. It exists so the ban on hand-written `mode: 'insensitive'` has
 * an answer for the first one, rather than an eslint-disable.
 */
export const startsWithInsensitive = (value: string) => ({
  startsWith: escapeLike(value),
  mode: Prisma.QueryMode.insensitive,
});

/**
 * Prisma `endsWith` filter matching a value literally, case-insensitively.
 *
 * The one filter with nothing appended after the value: Prisma binds `%value`,
 * so an unescaped trailing backslash ends the pattern as a dangling escape and
 * silently swallows the comparison. Escaping is what keeps it a suffix match.
 *
 * No caller yet, for the same reason as the prefix twin above.
 */
export const endsWithInsensitive = (value: string) => ({
  endsWith: escapeLike(value),
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
 * The `%...%` pattern for an ILIKE, with the value's metacharacters escaped:
 * only the wrapping wildcards are meant as wildcards.
 *
 * Private, and the export is worth not adding back. The wildcards make it a
 * substring pattern and nothing else, so as the value of any other filter
 * (`{ startsWith: likeContainsPattern(q) }`) it binds `%q%` and quietly turns a
 * prefix match into a substring one. `ilikeContains` below is the one shape
 * that uses it correctly, and it is the only thing that should.
 */
const likeContainsPattern = (value: string) => `%${escapeLike(value)}%`;

/**
 * A case-insensitive substring match against one column, as raw SQL.
 *
 * The only place in the backend that writes ILIKE. A builder composes these
 * rather than spelling the operator out, so there is exactly one expression to
 * read to know that every raw pattern in the app is escaped, and one place a
 * mistake could be made. A lint rule holds the line.
 *
 * The column is `Prisma.Sql` rather than a string so it can only be assembled
 * from literal SQL a caller wrote, never from a bound value.
 */
export const ilikeContains = (column: Prisma.Sql, value: string): Prisma.Sql =>
  Prisma.sql`${column} ILIKE ${likeContainsPattern(value)}`;
