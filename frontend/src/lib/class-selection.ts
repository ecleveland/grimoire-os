import type { SrdClass } from '@/lib/types';
import type { SrdComboboxOption } from '@/components/SrdCombobox';
import {
  resolveByIdThenUniqueName,
  sourceLabelledOptions,
  type IdName,
} from '@/lib/content-selection';

/**
 * Resolve the selected class from the merged `/srd/classes` catalog.
 *
 * id-first (VEG-524). VEG-506 let a user create a homebrew "Fighter" alongside
 * the SRD one, and `findAllClasses` sorts by name — so before this, `.find`
 * returned whichever row the query plan happened to put first. Two things read
 * off the result and both are silently wrong when it picks the other row:
 * `classFeaturesAtLevel` offers the wrong per-level features, and
 * `asDieType(hitDie)` seeds the hit die that `hpGain` writes into a *permanent*
 * HP maximum. Nothing errors, and the resolution can differ between two loads of
 * the same sheet.
 *
 * A colliding name with no id resolves to `undefined` rather than a guess; the
 * level-up dialog surfaces that as its existing "class data unavailable" warning
 * instead of quietly using the wrong die. See `resolveByIdThenUniqueName` for
 * the full rule set, which is shared with `resolveBackground`.
 */
export function resolveClass<T extends IdName>(
  classes: T[],
  selection: { id: string; name: string }
): T | undefined {
  return resolveByIdThenUniqueName(classes, selection);
}

/**
 * Combobox options for the class picker, with colliding names labelled by source
 * ("Fighter (Homebrew)"). Mirrors `backgroundOptions`.
 */
export function classOptions(classes: SrdClass[]): SrdComboboxOption[] {
  return sourceLabelledOptions(classes);
}
