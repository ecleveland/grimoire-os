import type { SearchClassHitField, SearchKind } from '@grimoire-os/shared';
import type { SrdSpell, SrdFeat, SrdItem, SrdClass } from '@/lib/types';

export type FeatureParentKind = 'class' | 'subclass' | 'race' | 'background';

/**
 * The ids a drilldown link reads off a parent. Three of the four kinds have a
 * page of their own, so the id is the whole path. A subclass has no page: it
 * renders as a card on its class page, so it carries the class id as well and
 * the link uses the subclass id as the anchor.
 *
 * Separate from `FeatureParent` because a class hit links to its own page with
 * no feature in hand, and should not have to invent a name to get a URL.
 */
export type FeatureParentLink =
  | { kind: Exclude<FeatureParentKind, 'subclass'>; id: string }
  | { kind: 'subclass'; id: string; classId: string };

/** The parent a feature hit drills down to, labelled for the breadcrumb. */
export type FeatureParent = FeatureParentLink & { name: string };

export type UnifiedFeatureData = {
  id: string;
  name: string;
  level?: number;
  description: string;
  parent: FeatureParent;
};

/**
 * The class columns a hit carries, keyed off the shared field list the backend
 * builds its `select` from. Not `SrdClass`: the hit has no `features` key, and
 * typing it as the full row would let `cls.features.map(…)` compile and then
 * crash on undefined.
 */
export type UnifiedClassHitData = Pick<SrdClass, SearchClassHitField>;

export type UnifiedSearchHit =
  | { kind: 'spell'; data: SrdSpell }
  | { kind: 'feat'; data: SrdFeat }
  | { kind: 'item'; data: SrdItem }
  | { kind: 'class'; data: UnifiedClassHitData }
  | { kind: 'feature'; data: UnifiedFeatureData };

export const KIND_LABEL: Record<SearchKind, string> = {
  spell: 'Spell',
  feat: 'Feat',
  item: 'Item',
  class: 'Class',
  feature: 'Feature',
};

export const KIND_LABEL_PLURAL: Record<SearchKind, string> = {
  spell: 'Spells',
  feat: 'Feats',
  item: 'Items',
  class: 'Classes',
  feature: 'Features',
};

export function parentDetailHref(parent: FeatureParentLink): string {
  switch (parent.kind) {
    case 'class':
      return `/srd/classes/${parent.id}`;
    // The class page renders each subclass as a card carrying its own id, so
    // the anchor scrolls to the right one.
    case 'subclass':
      return `/srd/classes/${parent.classId}#${parent.id}`;
    case 'race':
      return `/srd/races/${parent.id}`;
    case 'background':
      return `/srd/backgrounds/${parent.id}`;
  }
}
