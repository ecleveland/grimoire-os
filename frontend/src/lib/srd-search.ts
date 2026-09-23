import type { SearchClassHitField, SearchKind } from '@grimoire-os/shared';
import type { SrdSpell, SrdFeat, SrdItem, SrdClass } from '@/lib/types';

export type FeatureParentKind = 'class' | 'subclass' | 'race' | 'background';

export type UnifiedFeatureData = {
  id: string;
  name: string;
  level?: number;
  description: string;
  parent: { kind: FeatureParentKind; id: string; name: string };
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

export function parentDetailHref(parent: { kind: FeatureParentKind; id: string }): string {
  switch (parent.kind) {
    case 'class':
      return `/srd/classes/${parent.id}`;
    case 'subclass':
      return `/srd/classes#${parent.id}`;
    case 'race':
      return `/srd/races/${parent.id}`;
    case 'background':
      return `/srd/backgrounds/${parent.id}`;
  }
}
