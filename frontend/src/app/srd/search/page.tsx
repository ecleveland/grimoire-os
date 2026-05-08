'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { PaginatedResponse } from '@/lib/types';
import {
  ALL_SEARCH_KINDS,
  KIND_LABEL,
  KIND_LABEL_PLURAL,
  SearchKind,
  UnifiedSearchHit,
  detailHrefFor,
} from '@/lib/srd-search';
import SearchBox from '@/components/SearchBox';
import FilterBar from '@/components/FilterBar';
import Pagination from '@/components/Pagination';

const LIMIT = 20;

const SPELL_SCHOOLS = [
  'Abjuration',
  'Conjuration',
  'Divination',
  'Enchantment',
  'Evocation',
  'Illusion',
  'Necromancy',
  'Transmutation',
];

const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

const FEATURE_PARENT_TYPES: {
  value: 'class' | 'subclass' | 'race' | 'background';
  label: string;
}[] = [
  { value: 'class', label: 'Class' },
  { value: 'subclass', label: 'Subclass' },
  { value: 'race', label: 'Race' },
  { value: 'background', label: 'Background' },
];

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

export default function SrdSearchPage() {
  const [hits, setHits] = useState<UnifiedSearchHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);

  const [search, setSearch] = useState('');
  const [enabledKinds, setEnabledKinds] = useState<Set<SearchKind>>(new Set(ALL_SEARCH_KINDS));

  // Spell sub-filters
  const [spellLevel, setSpellLevel] = useState('');
  const [spellSchool, setSpellSchool] = useState('');

  // Feat sub-filters
  const [featPrereq, setFeatPrereq] = useState('');

  // Feature sub-filters
  const [featureParent, setFeatureParent] = useState('');

  const handleDebouncedSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  // Fetch results.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (search) params.set('q', search);
    if (enabledKinds.size > 0 && enabledKinds.size < ALL_SEARCH_KINDS.length) {
      params.set('types', Array.from(enabledKinds).join(','));
    }
    const onlySpells = enabledKinds.size === 1 && enabledKinds.has('spell');
    const onlyFeats = enabledKinds.size === 1 && enabledKinds.has('feat');
    const onlyFeatures = enabledKinds.size === 1 && enabledKinds.has('feature');
    if (onlySpells) {
      if (spellLevel !== '') params.set('level', spellLevel);
      if (spellSchool) params.set('school', spellSchool);
    }
    if (onlyFeats) {
      if (featPrereq) params.set('hasPrerequisite', featPrereq);
    }
    if (onlyFeatures) {
      if (featureParent) params.set('parentType', featureParent);
    }

    apiFetch<PaginatedResponse<UnifiedSearchHit>>(`/srd/search?${params.toString()}`)
      .then(res => {
        if (cancelled) return;
        setHits(res.data);
        setTotal(res.total);
        setLastPage(res.lastPage);
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        console.error('Failed to load search results:', err);
        toast.error('Failed to load search results', { id: 'load-search' });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [page, search, enabledKinds, spellLevel, spellSchool, featPrereq, featureParent]);

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

  const updateSpellLevel = (value: string) => {
    setSpellLevel(value);
    setPage(1);
  };
  const updateSpellSchool = (value: string) => {
    setSpellSchool(value);
    setPage(1);
  };
  const updateFeatPrereq = (value: string) => {
    setFeatPrereq(value);
    setPage(1);
  };
  const updateFeatureParent = (value: string) => {
    setFeatureParent(value);
    setPage(1);
  };

  const onlySpells = enabledKinds.size === 1 && enabledKinds.has('spell');
  const onlyFeats = enabledKinds.size === 1 && enabledKinds.has('feat');
  const onlyFeatures = enabledKinds.size === 1 && enabledKinds.has('feature');

  const countLabel = useMemo(() => {
    if (loading) return 'Loading…';
    return `${total} result${total !== 1 ? 's' : ''}`;
  }, [loading, total]);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Search SRD</h1>

      <div className="mb-4">
        <SearchBox
          onDebouncedChange={handleDebouncedSearch}
          placeholder="Search spells, feats, and features..."
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {ALL_SEARCH_KINDS.map(kind => {
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

      {(onlySpells || onlyFeats || onlyFeatures) && (
        <FilterBar>
          {onlySpells && (
            <>
              <label className="block text-sm">
                <span className="block mb-1 text-gray-600 dark:text-gray-400">Spell Level</span>
                <select
                  aria-label="Spell Level"
                  value={spellLevel}
                  onChange={e => updateSpellLevel(e.target.value)}
                  className={inputClass}
                >
                  <option value="">All Levels</option>
                  {SPELL_LEVELS.map(l => (
                    <option key={l} value={l}>
                      {l === 0 ? 'Cantrip' : `Level ${l}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="block mb-1 text-gray-600 dark:text-gray-400">Spell School</span>
                <select
                  aria-label="Spell School"
                  value={spellSchool}
                  onChange={e => updateSpellSchool(e.target.value)}
                  className={inputClass}
                >
                  <option value="">All Schools</option>
                  {SPELL_SCHOOLS.map(s => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          {onlyFeats && (
            <label className="block text-sm">
              <span className="block mb-1 text-gray-600 dark:text-gray-400">Prerequisite</span>
              <select
                aria-label="Prerequisite"
                value={featPrereq}
                onChange={e => updateFeatPrereq(e.target.value)}
                className={inputClass}
              >
                <option value="">Any</option>
                <option value="true">Has prerequisite</option>
                <option value="false">No prerequisite</option>
              </select>
            </label>
          )}
          {onlyFeatures && (
            <label className="block text-sm">
              <span className="block mb-1 text-gray-600 dark:text-gray-400">Parent Type</span>
              <select
                aria-label="Parent Type"
                value={featureParent}
                onChange={e => updateFeatureParent(e.target.value)}
                className={inputClass}
              >
                <option value="">All Sources</option>
                {FEATURE_PARENT_TYPES.map(p => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </FilterBar>
      )}

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{countLabel}</p>

      <div className={`space-y-3 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        {hits.map(hit => (
          <ResultCard key={`${hit.kind}-${hit.id}`} hit={hit} />
        ))}
      </div>

      <Pagination
        page={page}
        lastPage={lastPage}
        total={total}
        limit={LIMIT}
        onPageChange={setPage}
      />
    </div>
  );
}

function ResultCard({ hit }: { hit: UnifiedSearchHit }) {
  return (
    <Link
      href={detailHrefFor(hit)}
      className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{hit.name}</h2>
        <span className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded">
          {KIND_LABEL[hit.kind]}
        </span>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitleFor(hit)}</p>
    </Link>
  );
}

function subtitleFor(hit: UnifiedSearchHit): string {
  if (hit.kind === 'spell') {
    return `${hit.level === 0 ? 'Cantrip' : `Level ${hit.level}`} · ${hit.school}`;
  }
  if (hit.kind === 'feat') {
    return hit.prerequisite ?? 'No prerequisite';
  }
  // feature
  const lvl = hit.level !== undefined ? ` · Level ${hit.level}` : '';
  return `${capitalize(hit.parent.kind)}: ${hit.parent.name}${lvl}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
