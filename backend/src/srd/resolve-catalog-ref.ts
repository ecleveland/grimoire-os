import { Prisma } from '@prisma/client';

/** Minimal shape resolveCatalogRef keys on — an id plus a display name. */
export interface IdNamed {
  id: string;
  name: string;
}

/**
 * What a caller is trying to resolve: a display name, plus the id of the row the
 * picker landed on if there was one.
 *
 * Keys are required and nullable rather than optional, matching the frontend
 * twin's `CatalogSelection` (frontend/src/lib/content-selection.ts). Both
 * producers are admitted unconverted — form state spells "absent" as `''`, a
 * loaded row spells it as `null` — and the resolver's first act is a falsiness
 * check either way.
 */
export interface CatalogSelection {
  id: string | null | undefined;
  name: string | null | undefined;
}

/**
 * Escape the LIKE metacharacters Postgres honours in a value bound to ILIKE.
 * Backslash first, or it would re-escape the escapes it just added.
 *
 * Exported because it is only correct if there is exactly one copy. It lives
 * beside the resolver because the two are halves of one rule: this narrows in
 * SQL, `resolveByUniqueName` decides in code.
 */
export const escapeLike = (value: string) =>
  value.replace(/[\\%_]/g, character => `\\${character}`);

/**
 * Prisma `where` fragment matching a catalog row's name, case-insensitively and
 * literally.
 *
 * THE ESCAPING IS LOAD-BEARING. Prisma compiles `mode: 'insensitive'` to
 * `name ILIKE $1` and binds the value as a *pattern*, not a string. Measured
 * against the dev database on Prisma 6.19.2: `equals: 'Fighte_'` returned the SRD
 * Fighter, `equals: 'Wiz%'` returned Wizard, and `equals: '%'` returned every
 * class. A character free-typed as "Wizar_" would have had the SRD Wizard's id
 * derived and written to `classId` permanently, granting a real class's spell
 * slots to a class that does not exist. A name ending in a backslash is worse
 * still: unescaped, Postgres raises 22025 ("LIKE pattern must not end with escape
 * character") mid-scan, which surfaces as a 500 on every read of that sheet.
 *
 * Callers must still decide with `resolveByUniqueName`, so a future change to the
 * emitted SQL can only widen what is fetched, never what resolves.
 */
export const catalogNameWhere = (name: string) => ({
  name: { equals: escapeLike(name), mode: Prisma.QueryMode.insensitive },
});

/**
 * The backend's single catalog-reference resolver, and the twin of the frontend's
 * `resolveByIdThenUniqueName` (frontend/src/lib/content-selection.ts).
 *
 * id-first (VEG-473/476/481): homebrew rows may legally share an SRD (or
 * shared-tier) row's name — per-tier partial unique indexes, VEG-431 — so a
 * non-empty `id` is the only unambiguous key. Resolving by name alone returns
 * whichever duplicate sorts first and silently pulls the wrong tier's data (the
 * VEG-481 NPC-generator bug this mirrors the fix for). Only when no id resolves —
 * a decision persisted before ids were threaded carries the display `name` but no
 * id, a free-typed custom name never had one, and a persisted id can go stale when
 * its row is deleted — does it fall back to a name match, and then only when that
 * name is *unambiguous*: a colliding name resolves to nothing (undefined) rather
 * than guessing the wrong tier, so the fallback can never re-introduce the
 * wrong-tier bug. A stale/unknown id therefore degrades to the same
 * unambiguous-name path as no id at all, not to a blank.
 *
 * Generic, and shared by every backend caller that resolves a catalog reference:
 * backgrounds in the NPC generator, classes in CharactersService since VEG-528.
 * It was background-specific until then, which meant the class rule got written a
 * second time by hand and immediately drifted — the copy counted whatever the SQL
 * `where` had returned instead of re-filtering by name, so its correctness rested
 * on a non-local argument about how that `where` was built. One copy per side is
 * the whole point; the frontend twin's comment says the same thing.
 *
 * The name comparison here is AUTHORITATIVE, deliberately. Callers may narrow in
 * SQL first, but a SQL predicate is not obliged to mean the same thing as this
 * does: Prisma's `mode: 'insensitive'` compiles to ILIKE, which treats its
 * argument as a *pattern*, so `%` and `_` in a stored name match rows the name
 * does not name. Deciding in code keeps the rule one expression that both halves
 * of the app can be read against, and makes the SQL a pure narrowing step.
 */
export function resolveCatalogRef<T extends IdNamed>(
  pool: readonly T[],
  selection: CatalogSelection
): T | undefined {
  if (selection.id) {
    const byId = pool.find(b => b.id === selection.id);
    // A resolved id is authoritative; a stale/unknown one falls through to the
    // unambiguous-name path below rather than clearing the resolution.
    if (byId) return byId;
  }
  return resolveByUniqueName(pool, selection.name);
}

/**
 * The name half of the rule on its own: resolve only when exactly one row bears
 * this name, compared case-insensitively.
 *
 * Split out for callers that have already settled the id question elsewhere.
 * `CharactersService` is one: it looks the id up in its own indexed query,
 * because Postgres cannot combine an index scan with a non-indexable ILIKE
 * branch, so merging the two into one `OR` degraded the whole predicate to a
 * sequential scan. Naming this half keeps that caller honestly sharing the piece
 * it uses rather than passing an id the function would ignore.
 */
export function resolveByUniqueName<T extends IdNamed>(
  pool: readonly T[],
  name: string | null | undefined
): T | undefined {
  if (!name) return undefined;
  // Collision test is case-insensitive to match the picker's labelling, so a
  // case-variant duplicate ("Acolyte" vs "acolyte") can't slip through the guard
  // and silently resolve to one tier.
  const key = name.toLowerCase();
  const matches = pool.filter(b => b.name.toLowerCase() === key);
  return matches.length === 1 ? matches[0] : undefined;
}
