/** Minimal shape resolveBackgroundRef keys on — an id plus a display name. */
export interface IdNamed {
  id: string;
  name: string;
}

/**
 * Backend twin of the frontend `resolveBackground` (frontend/src/lib/background-selection.ts).
 *
 * id-first (VEG-473/476/481): homebrew backgrounds may now legally share an SRD
 * (or shared-tier) background's name — per-tier partial unique indexes, VEG-431 —
 * so a non-empty `id` is the only unambiguous key. Resolving by name alone returns
 * whichever duplicate sorts first and silently pulls the wrong tier's data (the
 * VEG-481 NPC-generator bug this mirrors the fix for). Only when no id resolves —
 * a decision persisted before ids were threaded carries the display `name` but no
 * id, a free-typed custom name never had one, and a persisted id can go stale when
 * its row is deleted — does it fall back to a name match, and then only when that
 * name is *unambiguous*: a colliding name resolves to nothing (undefined) rather
 * than guessing the wrong tier, so the fallback can never re-introduce the
 * wrong-tier bug. A stale/unknown id therefore degrades to the same
 * unambiguous-name path as no id at all, not to a blank.
 */
export function resolveBackgroundRef<T extends IdNamed>(
  pool: T[],
  selection: { id?: string | null; name: string }
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
