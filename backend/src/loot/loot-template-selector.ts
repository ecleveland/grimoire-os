// Pluggable template selection for the loot roller. The strategy maps a
// selection key (NPC: profession, monster: creature type) plus a CR bucket to
// a loot template — or null when no template applies.

import { LootTemplate } from './loot.types';

export type LootTemplateSelector = (
  selectionKey: string | null,
  crBucket: string
) => LootTemplate | null;

/**
 * The default selection strategy, preserving the NPC generator's historical
 * `findLootTemplate` fallback chain: exact key + bucket match → any bucket for
 * the key → fallback key for the bucket → any fallback-key template → null.
 */
export function createFallbackTemplateSelector(
  templates: readonly LootTemplate[],
  fallbackKey: string
): LootTemplateSelector {
  const find = (key: string, bucket: string) =>
    templates.find(t => t.key === key && t.crBucket === bucket);
  return (selectionKey, crBucket) => {
    if (selectionKey) {
      const exact = find(selectionKey, crBucket);
      if (exact) return exact;
      const anyBucket = templates.find(t => t.key === selectionKey);
      if (anyBucket) return anyBucket;
    }
    const fallback = find(fallbackKey, crBucket);
    if (fallback) return fallback;
    return templates.find(t => t.key === fallbackKey) ?? null;
  };
}
