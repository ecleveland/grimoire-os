export type FeatureParentKind = 'class' | 'subclass' | 'race' | 'background';

export type UnifiedSearchHit =
  | {
      kind: 'spell';
      id: string;
      name: string;
      level: number;
      school: string;
      description: string;
    }
  | {
      kind: 'feat';
      id: string;
      name: string;
      prerequisite: string | null;
      description: string;
    }
  | {
      kind: 'feature';
      id: string;
      name: string;
      level?: number;
      description: string;
      parent: { kind: FeatureParentKind; id: string; name: string };
    };

export type SearchKind = 'spell' | 'feat' | 'feature';

export const ALL_SEARCH_KINDS: SearchKind[] = ['spell', 'feat', 'feature'];

export const KIND_LABEL: Record<SearchKind, string> = {
  spell: 'Spell',
  feat: 'Feat',
  feature: 'Feature',
};

export const KIND_LABEL_PLURAL: Record<SearchKind, string> = {
  spell: 'Spells',
  feat: 'Feats',
  feature: 'Features',
};

export function detailHrefFor(hit: UnifiedSearchHit): string {
  switch (hit.kind) {
    case 'spell':
      return `/srd/spells#${hit.id}`;
    case 'feat':
      return `/srd/feats#${hit.id}`;
    case 'feature':
      return parentHref(hit.parent);
  }
}

function parentHref(parent: { kind: FeatureParentKind; id: string }): string {
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
