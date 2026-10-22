'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { SEARCH_KINDS, type SearchKind } from '@grimoire-os/shared';
import { useListQuery } from '@/lib/query';
import {
  KIND_LABEL,
  KIND_LABEL_PLURAL,
  UnifiedClassHitData,
  UnifiedFeatureData,
  UnifiedSearchHit,
  featureDetailHref,
  parentDetailHref,
} from '@/lib/srd-search';
import SearchBox from '@/components/SearchBox';
import FilterBar from '@/components/FilterBar';
import Pagination from '@/components/Pagination';
import Badge from '@/components/Badge';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';
import Markdown from '@/components/Markdown';
import SpellDetail from '@/components/SpellDetail';
import FeatDetail from '@/components/FeatDetail';
import ItemDetail from '@/components/ItemDetail';
import PrintToggle from '@/components/PrintToggle';
import { levelLabel } from '@/lib/spell-constants';
import { SEARCH_FILTERS, searchFilterParams } from '@/lib/srd-search-filters';

const LIMIT = 20;

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

function hitId(hit: UnifiedSearchHit): string {
  return hit.data.id;
}

export default function SrdSearchPage() {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [enabledKinds, setEnabledKinds] = useState<Set<SearchKind>>(() => new Set(SEARCH_KINDS));

  // Sub-filter values, bucketed per kind so a feat category chosen under
  // Feats never leaks into the item query after switching to Items.
  const [filters, setFilters] = useState<Partial<Record<SearchKind, Record<string, string>>>>({});

  const handleDebouncedSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  // Sub-filters only apply while their kind is the sole one enabled.
  // `useListQuery` drops the empty ones.
  const soleKind = enabledKinds.size === 1 ? [...enabledKinds][0] : null;
  const soleFields = soleKind ? SEARCH_FILTERS[soleKind] : undefined;

  const list = useListQuery<UnifiedSearchHit>(
    '/srd/search',
    {
      page,
      limit: LIMIT,
      q: search,
      // Canonical order, not the Set's insertion order: toggling a chip off and
      // back on would otherwise move that kind to the end, and the anonymous
      // response cache keys on the whole URL.
      types:
        enabledKinds.size < SEARCH_KINDS.length
          ? SEARCH_KINDS.filter(k => enabledKinds.has(k)).join(',')
          : undefined,
      ...searchFilterParams(soleKind, soleKind ? filters[soleKind] : undefined),
    },
    {
      errorToast: { message: 'Failed to load search results', id: 'load-search' },
      // Results must reflect edits and deletes made on other pages.
      staleTime: 0,
    }
  );
  const hits = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const lastPage = list.data?.lastPage ?? 1;

  const toggleKind = (kind: SearchKind) => {
    setEnabledKinds(prev => {
      const next = new Set(prev);
      if (next.has(kind)) {
        if (next.size > 1) next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
    setPage(1);
  };

  const toggleExpand = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setFilter = (kind: SearchKind, param: string, value: string) => {
    setFilters(prev => ({ ...prev, [kind]: { ...prev[kind], [param]: value } }));
    setPage(1);
  };

  const countLabel = `${total} result${total !== 1 ? 's' : ''}`;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Search SRD</h1>

      <div className="mb-4">
        <SearchBox
          onDebouncedChange={handleDebouncedSearch}
          placeholder="Search spells, feats, items, classes, and features..."
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {SEARCH_KINDS.map(kind => {
          const enabled = enabledKinds.has(kind);
          return (
            <button
              key={kind}
              onClick={() => toggleKind(kind)}
              className={`px-3 py-1 rounded text-sm ${
                enabled
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              {KIND_LABEL_PLURAL[kind]}
            </button>
          );
        })}
      </div>

      {soleKind && soleFields && (
        <FilterBar>
          {soleFields.map(field => (
            <label key={field.param} className="block text-sm">
              <span className="block mb-1 text-gray-600 dark:text-gray-400">{field.label}</span>
              <select
                aria-label={field.label}
                value={filters[soleKind]?.[field.param] ?? ''}
                onChange={e => setFilter(soleKind, field.param, e.target.value)}
                className={inputClass}
              >
                <option value="">{field.emptyLabel}</option>
                {field.options.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </FilterBar>
      )}

      {list.isPending || (list.isError && list.isFetching) ? (
        <LoadingState className="text-sm mb-4" />
      ) : list.isError ? (
        <LoadError message="Failed to load search results." onRetry={() => list.refetch()} />
      ) : (
        <>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{countLabel}</p>

          <div
            className={`space-y-3 ${list.isFetching ? 'opacity-60' : ''}`}
            aria-busy={list.isFetching}
          >
            {hits.map(hit => {
              const key = `${hit.kind}-${hitId(hit)}`;
              const isOpen = expanded.has(key);
              return (
                <ResultCard
                  key={key}
                  hit={hit}
                  expanded={isOpen}
                  onToggle={() => toggleExpand(key)}
                />
              );
            })}
          </div>

          <Pagination
            page={page}
            lastPage={lastPage}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function ResultCard({
  hit,
  expanded,
  onToggle,
}: {
  hit: UnifiedSearchHit;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Spells, items and features are printable card types. Feats are not, and
  // neither is a class, whose features print individually from its own page.
  const printable =
    hit.kind === 'spell' || hit.kind === 'item' || hit.kind === 'feature'
      ? { type: hit.kind, id: hit.data.id, name: hit.data.name }
      : null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex items-start">
        <button
          onClick={onToggle}
          className="flex-1 flex items-start justify-between gap-3 p-4 text-left"
        >
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {hit.data.name}
              {hit.kind === 'spell' && hit.data.concentration && (
                <span className="ml-2 text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                  Concentration
                </span>
              )}
              {hit.kind === 'spell' && hit.data.ritual && (
                <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                  Ritual
                </span>
              )}
              {hit.kind === 'feat' && hit.data.repeatable && (
                <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                  Repeatable
                </span>
              )}
              {hit.kind === 'item' && hit.data.requiresAttunement && (
                <span className="ml-2 text-xs px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
                  Requires Attunement
                </span>
              )}
              {/* Every kind but feature carries its own content tier; a feature
                  inherits its parent's, which the hit does not include. */}
              {hit.kind !== 'feature' && hit.data.contentSource === 'homebrew' && (
                <Badge variant="homebrew" className="ml-2 inline-block align-middle">
                  Homebrew
                </Badge>
              )}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitleFor(hit)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded whitespace-nowrap">
              {KIND_LABEL[hit.kind]}
            </span>
            <span className="text-gray-400 text-lg">{expanded ? '−' : '+'}</span>
          </div>
        </button>
        {printable && (
          <PrintToggle
            type={printable.type}
            id={printable.id}
            name={printable.name}
            className="mt-4 mr-4 shrink-0"
          />
        )}
      </div>
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
          {hit.kind === 'spell' && <SpellDetail spell={hit.data} />}
          {hit.kind === 'feat' && <FeatDetail feat={hit.data} />}
          {hit.kind === 'item' && <ItemDetail item={hit.data} />}
          {hit.kind === 'class' && <ClassSummary cls={hit.data} />}
          {hit.kind === 'feature' && <FeatureDetail feature={hit.data} />}
        </div>
      )}
    </div>
  );
}

function subtitleFor(hit: UnifiedSearchHit): string {
  if (hit.kind === 'spell') {
    return `${levelLabel(hit.data.level)} · ${hit.data.school} · ${hit.data.castingTime}`;
  }
  if (hit.kind === 'feat') {
    const parts = [hit.data.category, hit.data.prerequisite].filter(Boolean) as string[];
    return parts.length ? parts.join(' · ') : 'Feat';
  }
  if (hit.kind === 'item') {
    const parts = [hit.data.category, hit.data.rarity].filter(Boolean) as string[];
    return parts.length ? parts.join(' · ') : 'Item';
  }
  if (hit.kind === 'class') {
    const sub =
      hit.data.subclassLevel != null ? ` · Subclass at level ${hit.data.subclassLevel}` : '';
    return `${hit.data.hitDie} hit die${sub}`;
  }
  // feature
  const lvl = hit.data.level !== undefined ? ` · Level ${hit.data.level}` : '';
  return `${capitalize(hit.data.parent.kind)}: ${hit.data.parent.name}${lvl}`;
}

/**
 * A class hit's expanded body. Deliberately a summary and a link rather than the
 * full `ClassDetail`. The class page is where the proficiencies and the
 * feature list live, and a search result that reproduced them would bury the
 * other hits.
 */
function ClassSummary({ cls }: { cls: UnifiedClassHitData }) {
  return (
    <div className="space-y-3">
      {/* Same classes as ClassDetail, so a description does not wrap one way in
          the hit and another on the class page. */}
      {cls.description && (
        <p className="text-gray-600 dark:text-gray-400 text-sm">{cls.description}</p>
      )}
      <Link
        href={parentDetailHref({ kind: 'class', id: cls.id })}
        className="inline-block text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        Open {cls.name} Class →
      </Link>
    </div>
  );
}

function FeatureDetail({ feature }: { feature: UnifiedFeatureData }) {
  return (
    <div className="space-y-3">
      <Markdown>{feature.description}</Markdown>
      <Link
        href={featureDetailHref(feature)}
        className="inline-block text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        Open {feature.parent.name} {capitalize(feature.parent.kind)} →
      </Link>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
