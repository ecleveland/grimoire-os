import { useCallback, useEffect, useRef } from 'react';
import type { ContentSource } from '@/lib/types';
import type { SrdComboboxOption } from '@/components/SrdCombobox';

/** Minimal shape the resolvers key on — an id plus a display name. */
export interface IdName {
  id: string;
  name: string;
}

/** An `IdName` that also declares which tier it came from. */
export interface IdNameSourced extends IdName {
  contentSource: ContentSource;
}

/**
 * What the caller is trying to resolve: a display name, plus the id of the row
 * the picker landed on if there was one.
 *
 * Deliberately NOT `IdName`. An `IdName.id` is a real row id; a selection's is
 * "the id, if any" — blank for a free-typed name, absent on a character saved
 * before the column existed. Both producers are admitted unconverted: form state
 * spells absent as `''` (a controlled input's real DOM value), while a loaded
 * character spells it as `null`. Narrowing handles the rest, and the resolver's
 * first act is a falsiness check either way.
 */
export interface CatalogSelection {
  id: string | null | undefined;
  name: string | null | undefined;
}

/**
 * Resolve a selection out of a merged (srd + shared + homebrew) catalog.
 *
 * Homebrew rows may legally reuse an SRD row's name — per-tier partial unique
 * indexes, VEG-431 — so a non-empty `id` is the only unambiguous key. Resolving
 * by name alone returns whichever duplicate sorts first, which is how a
 * character silently picked up the wrong background's grants (VEG-473) and, once
 * VEG-506 shipped homebrew classes, the wrong class's features and hit die
 * (VEG-524).
 *
 * The rules, in order:
 *
 * 1. A resolved `id` is authoritative. It records the row the picker actually
 *    landed on, so it beats any name reasoning.
 * 2. A stale or unknown id — a deleted homebrew row, an id from another user's
 *    library — falls through rather than clearing the selection, so a character
 *    keeps its grants for as long as the name stays unique.
 * 3. The name fallback resolves *only when that name is unambiguous*. A
 *    colliding name yields `undefined` rather than a guess.
 *
 * Rule 3 is what makes the fallback safe: it cannot re-introduce the wrong-row
 * bug these fixes target. Callers get "no data" — an omitted suggestion, or a
 * visible warning — instead of confident wrong data.
 *
 * Shared by every entity resolver (`resolveBackground`, `resolveClass`) on
 * purpose. These rules are subtle and safety-bearing; one copy per entity would
 * let a fix land in one and not the others.
 */
export function resolveByIdThenUniqueName<T extends IdName>(
  rows: T[],
  selection: CatalogSelection
): T | undefined {
  if (selection.id) {
    const byId = rows.find(r => r.id === selection.id);
    if (byId) return byId;
  }
  if (!selection.name) return undefined;
  // Case-insensitive to match sourceLabelledOptions' collision test, so a
  // case-variant duplicate ("Acolyte" vs "acolyte") the dropdown flags cannot
  // slip through this guard and silently resolve to one tier.
  const key = selection.name.toLowerCase();
  const matches = rows.filter(r => r.name.toLowerCase() === key);
  return matches.length === 1 ? matches[0] : undefined;
}

/**
 * Whether a selection names more than one catalog row and no id picks between
 * them. This is the case where `resolveByIdThenUniqueName` declines to guess, as
 * distinct from a custom name that matches nothing. A picker uses it to tell the
 * user to choose from the list, and a wizard step uses it to report itself
 * incomplete instead of carrying a name with no grants forward.
 */
export function isAmbiguousSelection<T extends IdName>(
  rows: T[],
  selection: CatalogSelection
): boolean {
  if (!selection.name || resolveByIdThenUniqueName(rows, selection)) return false;
  const key = selection.name.toLowerCase();
  return rows.filter(r => r.name.toLowerCase() === key).length > 1;
}

/**
 * The inline message for an ambiguous selection, or `undefined` when there is
 * nothing to say. `noun` is the singular entity name ("class", "background").
 */
export function ambiguousSelectionMessage<T extends IdName>(
  rows: T[],
  selection: CatalogSelection,
  noun: string
): string | undefined {
  return isAmbiguousSelection(rows, selection)
    ? `More than one ${noun} is named "${selection.name}". Pick one from the list.`
    : undefined;
}

/**
 * The id a picker should carry after the user types `typedName`.
 *
 * Typing normally clears the id so a stale one cannot keep granting a row the
 * user has edited away from. That rule only needs the id gone while the text
 * names something else. When the text names the row `rememberedId` points at
 * (case-insensitively, like the resolver), keeping the id loses nothing and
 * stops a retype of the same name from turning a picked duplicate back into an
 * ambiguous one.
 */
export function retainedSelectionId<T extends IdName>(
  rows: T[],
  rememberedId: string | null | undefined,
  typedName: string
): string {
  if (!rememberedId) return '';
  const row = rows.find(r => r.id === rememberedId);
  return row && row.name.toLowerCase() === typedName.toLowerCase() ? row.id : '';
}

/**
 * Returns the `onChange` id rule for a catalog picker: given the typed text,
 * the id to store beside it.
 *
 * Keystrokes pass through strings that name nothing ("F", "Fi"), and each of
 * those clears the id. So the picker remembers the last non-empty id it held
 * and restores it once the text names that row again, via
 * `retainedSelectionId`. A pick from the list updates the memory through
 * `currentId`.
 */
export function useTypedSelectionId<T extends IdName>(
  rows: T[],
  currentId: string | null | undefined
): (typedName: string) => string {
  const remembered = useRef(currentId || '');
  useEffect(() => {
    if (currentId) remembered.current = currentId;
  }, [currentId]);
  return useCallback(
    (typedName: string) => retainedSelectionId(rows, remembered.current, typedName),
    [rows]
  );
}

const SOURCE_SUFFIX: Record<ContentSource, string> = {
  srd: 'SRD',
  shared: 'Shared',
  homebrew: 'Homebrew',
};

/**
 * Combobox options for a catalog picker. When two or more rows share a
 * (case-insensitive) name, every colliding entry gets a source suffix in its
 * display `label` (e.g. "Fighter (Homebrew)") so otherwise-identical rows are
 * distinguishable.
 *
 * The committed value stays the bare `name`; only the dropdown label is
 * decorated, so filtering, exact-match, and the persisted display string are
 * unaffected. Unique names — the overwhelming common case — render undecorated.
 */
export function sourceLabelledOptions<T extends IdNameSourced>(rows: T[]): SrdComboboxOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return rows.map(r => {
    const collides = (counts.get(r.name.toLowerCase()) ?? 0) > 1;
    return collides
      ? { id: r.id, name: r.name, label: `${r.name} (${SOURCE_SUFFIX[r.contentSource]})` }
      : { id: r.id, name: r.name };
  });
}
