import type { SrdBackground } from '@/lib/types';
import type { SrdComboboxOption } from '@/components/SrdCombobox';
import {
  resolveByIdThenUniqueName,
  sourceLabelledOptions,
  type IdName,
} from '@/lib/content-selection';

/**
 * Resolve the selected background from the merged `/srd/backgrounds` catalog.
 *
 * id-first (VEG-473): homebrew backgrounds may legally share an SRD background's
 * name (per-tier partial unique indexes, VEG-431), so a non-empty `id` is the
 * only unambiguous key — resolving by name would return whichever duplicate
 * sorts first and silently grant the wrong skills/feat/equipment.
 *
 * The id-first, stale-id-degrades, ambiguous-name-resolves-to-nothing rules moved
 * to `resolveByIdThenUniqueName` in VEG-524, which documents them in full; class
 * selection needed the identical contract and two copies of logic this subtle
 * would drift.
 */
export function resolveBackground<T extends IdName>(
  backgrounds: T[],
  selection: { id: string; name: string }
): T | undefined {
  return resolveByIdThenUniqueName(backgrounds, selection);
}

/**
 * Combobox options for the background picker, with colliding names labelled by
 * source ("Acolyte (Homebrew)"). Mirrors `classOptions`.
 */
export function backgroundOptions(backgrounds: SrdBackground[]): SrdComboboxOption[] {
  return sourceLabelledOptions(backgrounds);
}
