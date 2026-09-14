import { classFeatureIdentity } from '@grimoire-os/shared';
import type { ClassFeatureDraft } from '@/components/ClassFeaturesEditor';
import { MAX_LEVEL } from '@/lib/character-level';
import type { ClassFeature } from '@/lib/types';

/**
 * Feature-row mapping, comparison and validation, shared by the class form and
 * the subclass form. Both edit the same `ClassFeature` rows through the same
 * editor and send them to endpoints with the same replace-the-whole-list rule,
 * so the rules live here once rather than once per entity.
 *
 * A form calls `featureDraftsFrom` to load and `featuresToSend` to save; the
 * lower-level helpers below them are exported for their own tests.
 */

/**
 * API feature rows as drafts the features editor can hold.
 *
 * Named fields, not a spread. The draft type refuses an `id`, so tsc catches
 * that key, but a spread would still carry any other key an API row has and the
 * type doesn't declare, and the write DTO 400s a save that sends one.
 */
export function featureDraftsFrom(features: ClassFeature[] | undefined): ClassFeatureDraft[] {
  return (features ?? []).map(f => ({
    name: f.name,
    level: f.level,
    description: f.description ?? '',
  }));
}

/**
 * What a payload's `features` key should be: the trimmed rows, or nothing at all.
 *
 * A create has no baseline and always sends the list. An edit sends it only when
 * it differs from the loaded list, because the API replaces every stored row and
 * gives each a new id, which orphans print-tray entries still holding the old
 * ones. The list is validated only when it is sent, so a stored row these rules
 * would reject can't block an edit that leaves the list alone.
 */
export function featuresToSend(
  current: ClassFeatureDraft[],
  baseline?: ClassFeatureDraft[]
): { error: string } | { features?: FeatureRow[] } {
  const rows = toFeatureRows(current);
  if (baseline && sameFeatures(rows, toFeatureRows(baseline))) return {};
  const error = validateFeatures(rows);
  return error ? { error } : { features: rows };
}

/** A feature row as a payload sends it, trimmed. */
export interface FeatureRow {
  name: string;
  level: number;
  description: string;
}

export function toFeatureRows(features: ClassFeatureDraft[]): FeatureRow[] {
  return features.map(f => ({
    name: f.name.trim(),
    level: f.level,
    description: (f.description ?? '').trim(),
  }));
}

/** Whether two feature lists hold the same rows, in any order. Row order is a drafting aid. */
export function sameFeatures(a: FeatureRow[], b: FeatureRow[]): boolean {
  if (a.length !== b.length) return false;
  // JSON keeps the identity and the description apart, whatever characters either holds.
  const key = (f: FeatureRow) => JSON.stringify([classFeatureIdentity(f), f.description]);
  const counts = new Map<string, number>();
  for (const f of a) counts.set(key(f), (counts.get(key(f)) ?? 0) + 1);
  for (const f of b) {
    const left = counts.get(key(f)) ?? 0;
    if (left === 0) return false;
    counts.set(key(f), left - 1);
  }
  return true;
}

/**
 * The first thing wrong with a list of rows, or null when it's fit to send.
 *
 * `featuresToSend` runs this only on a list it is sending. The API stores rows
 * these rules would reject, because the write boundary compares raw names where
 * `toFeatureRows` trims them.
 */
export function validateFeatures(rows: FeatureRow[]): string | null {
  if (rows.some(f => !f.name)) return 'Every feature needs a name';
  // The editor holds NaN while a level box is cleared, until the box loses focus.
  if (rows.some(f => !Number.isInteger(f.level) || f.level < 1 || f.level > MAX_LEVEL)) {
    return `Every feature needs a level from 1 to ${MAX_LEVEL}`;
  }
  // Compared on the trimmed names, since those are what gets sent. The editor's
  // live warning sees "Rage" and "Rage " as two rows; the server sees one.
  const seen = new Set<string>();
  for (const feature of rows) {
    const identity = classFeatureIdentity(feature);
    if (seen.has(identity)) {
      return 'Two features share a name at the same level; each pairing must be unique';
    }
    seen.add(identity);
  }
  return null;
}
