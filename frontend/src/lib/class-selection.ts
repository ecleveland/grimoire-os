import type { SrdClass } from '@/lib/types';
import type { SrdComboboxOption } from '@/components/SrdCombobox';
import {
  resolveByIdThenUniqueName,
  sourceLabelledOptions,
  type CatalogSelection,
} from '@/lib/content-selection';
import { cleanList } from '@/lib/form-helpers';

/**
 * Resolve the selected class from the merged `/srd/classes` catalog.
 *
 * id-first (VEG-524). VEG-506 let a user create a homebrew "Fighter" alongside
 * the SRD one, and `findAllClasses` sorts by name — so before this, `.find`
 * returned whichever row the query plan happened to put first. Two things read
 * off the result and both are silently wrong when it picks the other row:
 * `classFeaturesAtLevel` offers the wrong per-level features, and
 * `asHitDie(hitDie)` seeds the hit die that `hpGain` writes into a *permanent*
 * HP maximum. Nothing errors, and the resolution can differ between two loads of
 * the same sheet.
 *
 * A colliding name with no id resolves to `undefined` rather than a guess; the
 * level-up dialog surfaces that as its existing "class data unavailable" warning
 * instead of quietly using the wrong die. See `resolveByIdThenUniqueName` for
 * the full rule set, which is shared with `resolveBackground`.
 */
export function resolveClass(
  classes: SrdClass[],
  selection: CatalogSelection
): SrdClass | undefined {
  return resolveByIdThenUniqueName(classes, selection);
}

/**
 * Combobox options for the class picker, with colliding names labelled by source
 * ("Fighter (Homebrew)"). Mirrors `backgroundOptions`.
 */
export function classOptions(classes: SrdClass[]): SrdComboboxOption[] {
  return sourceLabelledOptions(classes);
}

/**
 * The class's skill pool, cleaned the way `ClassForm` writes it. A stored pool
 * can hold blanks, padded entries, and repeats, so every reader has to clean it
 * the same way or they disagree about how many skills it offers.
 */
export function uniqueSkillPool(cls: Pick<SrdClass, 'skillChoices'> | undefined): string[] {
  return cleanList(cls?.skillChoices ?? []);
}

/**
 * How many class skills a character picks. The API accepts a `numSkillChoices`
 * above the pool size and a pool with blank or repeated entries, so the count is
 * capped at the cleaned pool's length.
 */
export function requiredSkillPicks(
  cls: Pick<SrdClass, 'skillChoices' | 'numSkillChoices'> | undefined
): number {
  return Math.min(cls?.numSkillChoices ?? 0, uniqueSkillPool(cls).length);
}
