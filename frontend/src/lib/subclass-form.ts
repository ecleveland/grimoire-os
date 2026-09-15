import type { ClassFeatureDraft } from '@/components/ClassFeaturesEditor';
import { featureDraftsFrom, featuresToSend, type FeatureRow } from '@/lib/feature-rows';
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

/**
 * Request body for POST and PATCH /srd/subclasses, minus the create-only `classId`.
 *
 * A create carries `name` and `description`. An edit carries only the fields the
 * author changed, and may be empty, because the card an edit opens from can be
 * stale when the refetch after the last save failed, and resending an untouched
 * field from it would revert that save. A PATCH that omits a key leaves the
 * stored value.
 */
export interface SubclassPayload {
  name?: string;
  description?: string | null;
  /** Present only when `featuresToSend` says the list must go; see there for why. */
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
    features: featureDraftsFrom(sc.features),
  };
}

export function formStateToPayload(
  s: SubclassFormState,
  baseline?: SubclassFormState
): SubclassFormResult {
  const name = s.name.trim();
  if (!name) return { error: 'Name is required' };

  const sent = featuresToSend(s.features, baseline?.features);
  if ('error' in sent) return { error: sent.error };

  // Compared as they would be sent, so whitespace the trim removes is no change.
  const description = optionalText(s.description);
  const payload: SubclassPayload = {};
  if (!baseline || name !== baseline.name.trim()) payload.name = name;
  if (!baseline || description !== optionalText(baseline.description)) {
    payload.description = description;
  }
  if (sent.features) payload.features = sent.features;
  return { payload };
}
