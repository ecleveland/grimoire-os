'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { PaginatedResponse, SrdSpell, SrdFeat } from '@/lib/types';
import {
  ALL_SEARCH_KINDS,
  KIND_LABEL,
  KIND_LABEL_PLURAL,
  SearchKind,
  UnifiedFeatureData,
  UnifiedSearchHit,
  parentDetailHref,
} from '@/lib/srd-search';
import SearchBox from '@/components/SearchBox';
import FilterBar from '@/components/FilterBar';
import Pagination from '@/components/Pagination';

const LIMIT = 20;

const SRD_CLASSES = [
  'Bard',
  'Cleric',
  'Druid',
  'Paladin',
  'Ranger',
  'Sorcerer',
  'Warlock',
  'Wizard',
];

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

const FEAT_CATEGORIES = ['Origin', 'General', 'Fighting Style', 'Epic Boon'];

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

function hitId(hit: UnifiedSearchHit): string {
  return hit.data.id;
}

export default function SrdSearchPage() {
  const [hits, setHits] = useState<UnifiedSearchHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [enabledKinds, setEnabledKinds] = useState<Set<SearchKind>>(new Set(ALL_SEARCH_KINDS));

  // Spell sub-filters
  const [spellClass, setSpellClass] = useState('');
  const [spellLevel, setSpellLevel] = useState('');
  const [spellSchool, setSpellSchool] = useState('');

  // Feat sub-filters
  const [featCategory, setFeatCategory] = useState('');
  const [featPrereq, setFeatPrereq] = useState('');
  const [featRepeatable, setFeatRepeatable] = useState('');

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
      if (spellClass) params.set('class', spellClass);
      if (spellLevel !== '') params.set('level', spellLevel);
      if (spellSchool) params.set('school', spellSchool);
    }
    if (onlyFeats) {
      if (featCategory) params.set('category', featCategory);
      if (featPrereq) params.set('hasPrerequisite', featPrereq);
      if (featRepeatable) params.set('repeatable', featRepeatable);
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
  }, [
    page,
    search,
    enabledKinds,
    spellClass,
    spellLevel,
    spellSchool,
    featCategory,
    featPrereq,
    featRepeatable,
    featureParent,
  ]);

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

  const resetPage = (setter: (v: string) => void) => (value: string) => {
    setter(value);
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
                <span className="block mb-1 text-gray-600 dark:text-gray-400">Spell Class</span>
                <select
                  aria-label="Spell Class"
                  value={spellClass}
                  onChange={e => resetPage(setSpellClass)(e.target.value)}
                  className={inputClass}
                >
                  <option value="">All Classes</option>
                  {SRD_CLASSES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="block mb-1 text-gray-600 dark:text-gray-400">Spell Level</span>
                <select
                  aria-label="Spell Level"
                  value={spellLevel}
                  onChange={e => resetPage(setSpellLevel)(e.target.value)}
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
                  onChange={e => resetPage(setSpellSchool)(e.target.value)}
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
            <>
              <label className="block text-sm">
                <span className="block mb-1 text-gray-600 dark:text-gray-400">Feat Category</span>
                <select
                  aria-label="Feat Category"
                  value={featCategory}
                  onChange={e => resetPage(setFeatCategory)(e.target.value)}
                  className={inputClass}
                >
                  <option value="">All Categories</option>
                  {FEAT_CATEGORIES.map(c => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="block mb-1 text-gray-600 dark:text-gray-400">Prerequisite</span>
                <select
                  aria-label="Prerequisite"
                  value={featPrereq}
                  onChange={e => resetPage(setFeatPrereq)(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Any</option>
                  <option value="true">Has prerequisite</option>
                  <option value="false">No prerequisite</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="block mb-1 text-gray-600 dark:text-gray-400">Repeatable</span>
                <select
                  aria-label="Repeatable"
                  value={featRepeatable}
                  onChange={e => resetPage(setFeatRepeatable)(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Any</option>
                  <option value="true">Repeatable</option>
                  <option value="false">Single-use</option>
                </select>
              </label>
            </>
          )}
          {onlyFeatures && (
            <label className="block text-sm">
              <span className="block mb-1 text-gray-600 dark:text-gray-400">Parent Type</span>
              <select
                aria-label="Parent Type"
                value={featureParent}
                onChange={e => resetPage(setFeatureParent)(e.target.value)}
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
        {hits.map(hit => {
          const key = `${hit.kind}-${hitId(hit)}`;
          const isOpen = expanded.has(key);
          return (
            <ResultCard key={key} hit={hit} expanded={isOpen} onToggle={() => toggleExpand(key)} />
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
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <button
        onClick={onToggle}
        className="w-full flex items-start justify-between gap-3 p-4 text-left"
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
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
          {hit.kind === 'spell' && <SpellDetail spell={hit.data} />}
          {hit.kind === 'feat' && <FeatDetail feat={hit.data} />}
          {hit.kind === 'feature' && <FeatureDetail feature={hit.data} />}
        </div>
      )}
    </div>
  );
}

function subtitleFor(hit: UnifiedSearchHit): string {
  if (hit.kind === 'spell') {
    const levelLabel = hit.data.level === 0 ? 'Cantrip' : `Level ${hit.data.level}`;
    return `${levelLabel} · ${hit.data.school} · ${hit.data.castingTime}`;
  }
  if (hit.kind === 'feat') {
    const parts = [hit.data.category, hit.data.prerequisite].filter(Boolean) as string[];
    return parts.length ? parts.join(' · ') : 'Feat';
  }
  // feature
  const lvl = hit.data.level !== undefined ? ` · Level ${hit.data.level}` : '';
  return `${capitalize(hit.data.parent.kind)}: ${hit.data.parent.name}${lvl}`;
}

function SpellDetail({ spell }: { spell: SrdSpell }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Range</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.range}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Components</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.components}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Duration</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.duration}</p>
        </div>
      </div>
      {spell.material && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Material</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.material}</p>
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
          {spell.description}
        </p>
      </div>
      {spell.higherLevels && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">At Higher Levels</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.higherLevels}</p>
        </div>
      )}
      {spell.classes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Classes</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {spell.classes.map(c => (
              <span
                key={c}
                className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FeatDetail({ feat }: { feat: SrdFeat }) {
  return (
    <div className="space-y-3">
      {feat.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
          {feat.description}
        </p>
      )}
      {feat.benefits && feat.benefits.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Benefits</h3>
          <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 mt-1 space-y-1">
            {feat.benefits.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FeatureDetail({ feature }: { feature: UnifiedFeatureData }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">
        {feature.description}
      </p>
      <Link
        href={parentDetailHref(feature.parent)}
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
