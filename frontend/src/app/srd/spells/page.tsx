'use client';

import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdSpell, PaginatedResponse } from '@/lib/types';
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

const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function SpellListPage() {
  const [spells, setSpells] = useState<SrdSpell[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchDebounce);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchDebounce]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, classFilter, levelFilter, schoolFilter]);

  // Fetch spells from server
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (search) params.set('q', search);
    if (classFilter) params.set('class', classFilter);
    if (levelFilter !== '') params.set('level', levelFilter);
    if (schoolFilter) params.set('school', schoolFilter);

    apiFetch<PaginatedResponse<SrdSpell>>(`/srd/spells?${params.toString()}`)
      .then(res => {
        setSpells(res.data);
        setTotal(res.total);
        setLastPage(res.lastPage);
      })
      .catch(err => {
        console.error('Failed to load spells:', err);
        toast.error('Failed to load spells', { id: 'load-spells' });
      })
      .finally(() => setLoading(false));
  }, [page, search, classFilter, levelFilter, schoolFilter]);

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  if (loading && spells.length === 0)
    return <div className="text-gray-500 dark:text-gray-400">Loading spells...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Spells</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search spells..."
          value={searchDebounce}
          onChange={e => setSearchDebounce(e.target.value)}
          className={inputClass}
        />
        <select
          value={classFilter}
          onChange={e => setClassFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">All Classes</option>
          {SRD_CLASSES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">All Levels</option>
          {SPELL_LEVELS.map(l => (
            <option key={l} value={l}>
              {l === 0 ? 'Cantrip' : `Level ${l}`}
            </option>
          ))}
        </select>
        <select
          value={schoolFilter}
          onChange={e => setSchoolFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">All Schools</option>
          {SPELL_SCHOOLS.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {total} spell{total !== 1 ? 's' : ''} found
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {spells.map(s => (
          <div
            key={s.id}
            className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <h3 className="font-semibold text-gray-900 dark:text-white">{s.name}</h3>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span>{s.level === 0 ? 'Cantrip' : `Level ${s.level}`}</span>
              <span>&middot;</span>
              <span>{s.school}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              <span className="font-medium">Casting Time:</span> {s.castingTime}
            </p>
            <div className="flex flex-wrap gap-1 mt-2">
              {s.concentration && (
                <span className="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                  Concentration
                </span>
              )}
              {s.ritual && (
                <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                  Ritual
                </span>
              )}
            </div>
          </div>
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
