import type { SearchKind } from '@grimoire-os/shared';
import { SRD_CLASSES, SPELL_SCHOOLS, SPELL_LEVELS, levelLabel } from '@/lib/spell-constants';
import { FEAT_CATEGORIES } from '@/lib/feat-constants';
import { ITEM_CATEGORIES, ITEM_RARITIES } from '@/lib/item-constants';

export interface SearchFilterOption {
  value: string;
  label: string;
}

export interface SearchFilterField {
  /** The query-string key the `/srd/search` endpoint reads. */
  param: string;
  /** The visible label, which is also the select's accessible name. */
  label: string;
  /** The label of the blank first option, which means "no filter". */
  emptyLabel: string;
  options: SearchFilterOption[];
}

/** Options whose value and label are the same string. */
function same(values: readonly string[]): SearchFilterOption[] {
  return values.map(value => ({ value, label: value }));
}

const FEATURE_PARENT_TYPES: SearchFilterOption[] = [
  { value: 'class', label: 'Class' },
  { value: 'subclass', label: 'Subclass' },
  { value: 'race', label: 'Race' },
  { value: 'background', label: 'Background' },
];

/**
 * Sub-filters per search kind. The search page shows a kind's fields only while
 * that kind is the sole one enabled. A kind absent here has none.
 */
export const SEARCH_FILTERS: Partial<Record<SearchKind, readonly SearchFilterField[]>> = {
  spell: [
    { param: 'class', label: 'Spell Class', emptyLabel: 'All Classes', options: same(SRD_CLASSES) },
    {
      param: 'level',
      label: 'Spell Level',
      emptyLabel: 'All Levels',
      options: SPELL_LEVELS.map(l => ({ value: String(l), label: levelLabel(l) })),
    },
    {
      param: 'school',
      label: 'Spell School',
      emptyLabel: 'All Schools',
      options: same(SPELL_SCHOOLS),
    },
  ],
  feat: [
    {
      param: 'category',
      label: 'Feat Category',
      emptyLabel: 'All Categories',
      options: same(FEAT_CATEGORIES),
    },
    {
      param: 'hasPrerequisite',
      label: 'Prerequisite',
      emptyLabel: 'Any',
      options: [
        { value: 'true', label: 'Has prerequisite' },
        { value: 'false', label: 'No prerequisite' },
      ],
    },
    {
      param: 'repeatable',
      label: 'Repeatable',
      emptyLabel: 'Any',
      options: [
        { value: 'true', label: 'Repeatable' },
        { value: 'false', label: 'Single-use' },
      ],
    },
  ],
  item: [
    {
      param: 'category',
      label: 'Item Category',
      emptyLabel: 'All Categories',
      options: same(ITEM_CATEGORIES),
    },
    { param: 'rarity', label: 'Rarity', emptyLabel: 'Any Rarity', options: same(ITEM_RARITIES) },
    {
      param: 'isMagic',
      label: 'Magic',
      emptyLabel: 'Any',
      options: [
        { value: 'true', label: 'Magic items' },
        { value: 'false', label: 'Mundane items' },
      ],
    },
  ],
  feature: [
    {
      param: 'parentType',
      label: 'Parent Type',
      emptyLabel: 'All Sources',
      options: FEATURE_PARENT_TYPES,
    },
  ],
};

/**
 * The query params a kind's filter values contribute. Every field of the kind
 * appears, with a blank value coming through as undefined so `useListQuery`
 * drops it. Values for params the kind does not filter on are ignored.
 */
export function searchFilterParams(
  kind: SearchKind | null,
  values: Record<string, string> | undefined
): Record<string, string | undefined> {
  const fields = kind ? SEARCH_FILTERS[kind] : undefined;
  if (!fields) return {};
  return Object.fromEntries(fields.map(f => [f.param, values?.[f.param] || undefined]));
}
