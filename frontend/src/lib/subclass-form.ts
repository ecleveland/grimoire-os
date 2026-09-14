import type { ClassFeatureDraft } from '@/components/ClassFeaturesEditor';
import { sameFeatures, toFeatureRows, validateFeatures, type FeatureRow } from '@/lib/feature-rows';
import { optionalText } from '@/lib/form-helpers';
import type { SrdSubclass } from '@/lib/types';

/**
 * Form-state and API-payload mapping for the homebrew subclass form, the
 * subclass counterpart of `lib/class-form`.
 *
 * The payload has no `classId`. A subclass never moves between classes (PATCH
 * 400s on the key), so the create caller adds it from the class page it is
 * editing under and nothing here carries it.
 *
 * `spellList` isn't edited either. A PATCH that omits a key leaves the stored
 * value alone, so leaving it out is what preserves it.
 */

export interface SubclassFormState {
  name: string;
  description: string;
  features: ClassFeatureDraft[];
}

/** Request body for POST and PATCH /srd/subclasses, minus the create-only `classId`. */
export interface SubclassPayload {
  name: string;
  description: string | null;
  /**
   * Sent only when the list changed. The API replaces every stored row and gives
   * each a new id, which orphans print-tray entries that still hold the old ones.
   */
  features?: FeatureRow[];
}

export type SubclassFormResult = { payload: SubclassPayload } | { error: string };

export function emptySubclassFormState(): SubclassFormState {
  return { name: '', description: '', features: [] };
}

export function subclassToFormState(sc: SrdSubclass): SubclassFormState {
  return {
    name: sc.name,
    description: sc.description ?? '',
    // Named fields, not a spread. The draft type refuses an `id`, so tsc catches
    // that key, but a spread would still carry any other key an API row has and
    // the type doesn't declare, and the write DTO 400s a save that sends one.
    features: (sc.features ?? []).map(f => ({
      name: f.name,
      level: f.level,
      description: f.description ?? '',
    })),
  };
}

export function formStateToPayload(
  s: SubclassFormState,
  baseline?: SubclassFormState
): SubclassFormResult {
  const name = s.name.trim();
  if (!name) return { error: 'Name is required' };

  const features = toFeatureRows(s.features);
  const featuresChanged = !baseline || !sameFeatures(features, toFeatureRows(baseline.features));
  // Validated only when the list is being sent, so a stored row this form would
  // reject can't block an edit that leaves the list alone.
  if (featuresChanged) {
    const featureError = validateFeatures(features);
    if (featureError) return { error: featureError };
  }

  const payload: SubclassPayload = { name, description: optionalText(s.description) };
  if (featuresChanged) payload.features = features;
  return { payload };
}
