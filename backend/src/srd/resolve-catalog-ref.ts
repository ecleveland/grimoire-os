/** Minimal shape resolveCatalogRef keys on — an id plus a display name. */
export interface IdNamed {
  id: string;
  name: string;
}

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
  pool: T[],
  selection: { id?: string | null; name?: string | null }
): T | undefined {
  if (selection.id) {
    const byId = pool.find(b => b.id === selection.id);
    // A resolved id is authoritative; a stale/unknown one falls through to the
    // unambiguous-name path below rather than clearing the resolution.
    if (byId) return byId;
  }
  if (!selection.name) return undefined;
  // Collision test is case-insensitive to match the picker's labelling, so a
  // case-variant duplicate ("Acolyte" vs "acolyte") can't slip through the guard
  // and silently resolve to one tier.
  const key = selection.name.toLowerCase();
  const matches = pool.filter(b => b.name.toLowerCase() === key);
  return matches.length === 1 ? matches[0] : undefined;
}
