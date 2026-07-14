import type { ContentSource, SrdBackground } from '@/lib/types';
import type { SrdComboboxOption } from '@/components/SrdCombobox';

/** Minimal shape resolveBackground keys on — an id plus a display name. */
interface IdName {
  id: string;
  name: string;
}

/**
 * Resolve the selected background from the merged `/srd/backgrounds` catalog.
 *
 * id-first (VEG-473): homebrew backgrounds may now legally share an SRD
 * background's name (per-tier partial unique indexes, VEG-431), so a non-empty
 * `id` is the only unambiguous key — resolving by name would return whichever
 * duplicate sorts first and silently grant the wrong skills/feat/equipment. Only
 * when no id is known — a character loaded from the API carries `background` (the
 * display string) but no id, and a free-typed custom name never had one — does it
 * fall back to a name match, and then only when that name is *unambiguous*: a
 * colliding name with no id resolves to nothing (undefined) rather than guessing
 * the wrong tier, so the fallback can never re-introduce the wrong-grant bug this
 * fix targets. Returns undefined when nothing matches (an unknown/stale id
 * likewise clears grants rather than falling back to name).
 */
export function resolveBackground<T extends IdName>(
  backgrounds: T[],
  selection: { id: string; name: string }
): T | undefined {
  if (selection.id) return backgrounds.find(b => b.id === selection.id);
  if (!selection.name) return undefined;
  // Collision test is case-insensitive to match backgroundOptions' labelling, so a
  // case-variant duplicate ("Acolyte" vs "acolyte") the dropdown flags can't slip
  // through the guard and silently resolve to one tier.
  const key = selection.name.toLowerCase();
  const matches = backgrounds.filter(b => b.name.toLowerCase() === key);
  return matches.length === 1 ? matches[0] : undefined;
}

const SOURCE_SUFFIX: Record<ContentSource, string> = {
  srd: 'SRD',
  shared: 'Shared',
  homebrew: 'Homebrew',
};

/**
 * Combobox options for the background picker. When two or more backgrounds share
 * a (case-insensitive) name — legal since homebrew can reuse an SRD name — every
 * colliding entry gets a source suffix in its display `label` (e.g. "Acolyte
 * (Homebrew)") so the otherwise-identical rows are distinguishable. The committed
 * value stays the bare `name`; only the dropdown label is decorated, so filtering,
 * exact-match, and the persisted background string are unaffected. Unique names
 * (the overwhelming common case) render undecorated.
 */
export function backgroundOptions(backgrounds: SrdBackground[]): SrdComboboxOption[] {
  const counts = new Map<string, number>();
  for (const b of backgrounds) {
    const key = b.name.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return backgrounds.map(b => {
    const collides = (counts.get(b.name.toLowerCase()) ?? 0) > 1;
    return collides
      ? { id: b.id, name: b.name, label: `${b.name} (${SOURCE_SUFFIX[b.contentSource]})` }
      : { id: b.id, name: b.name };
  });
}
