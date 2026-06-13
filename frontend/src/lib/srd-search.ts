import type { SrdSpell, SrdFeat, SrdItem } from '@/lib/types';

export type FeatureParentKind = 'class' | 'subclass' | 'race' | 'background';

export type UnifiedFeatureData = {
  id: string;
  name: string;
  level?: number;
  description: string;
  parent: { kind: FeatureParentKind; id: string; name: string };
};

export type UnifiedSearchHit =
  | { kind: 'spell'; data: SrdSpell }
  | { kind: 'feat'; data: SrdFeat }
  | { kind: 'item'; data: SrdItem }
  | { kind: 'feature'; data: UnifiedFeatureData };

export type SearchKind = 'spell' | 'feat' | 'item' | 'feature';

export const ALL_SEARCH_KINDS: SearchKind[] = ['spell', 'feat', 'item', 'feature'];

export const KIND_LABEL: Record<SearchKind, string> = {
  spell: 'Spell',
  feat: 'Feat',
  item: 'Item',
  feature: 'Feature',
};

export const KIND_LABEL_PLURAL: Record<SearchKind, string> = {
  spell: 'Spells',
  feat: 'Feats',
  item: 'Items',
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
