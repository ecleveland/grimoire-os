'use client';

import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdMonster, PaginatedResponse } from '@/lib/types';
import Pagination from '@/components/Pagination';

const LIMIT = 20;

const MONSTER_TYPES = [
  'Aberration',
  'Beast',
  'Celestial',
  'Construct',
  'Dragon',
  'Elemental',
  'Fey',
  'Fiend',
  'Giant',
  'Humanoid',
  'Monstrosity',
  'Ooze',
  'Plant',
  'Undead',
];

const CHALLENGE_RATINGS = [
  '0',
  '1/8',
  '1/4',
  '1/2',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
];

export default function MonsterListPage() {
  const [monsters, setMonsters] = useState<SrdMonster[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [crFilter, setCrFilter] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, crFilter]);

  // Fetch monsters from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (search) params.set('q', search);
    if (typeFilter) params.set('type', typeFilter);
    if (crFilter) params.set('cr', crFilter);

    apiFetch<PaginatedResponse<SrdMonster>>(`/srd/monsters?${params.toString()}`)
      .then(res => {
        setMonsters(res.data);
        setTotal(res.total);
        setLastPage(res.lastPage);
      })
      .catch(err => {
        console.error('Failed to load monsters:', err);
        toast.error('Failed to load monsters', { id: 'load-monsters' });
      })
      .finally(() => setLoading(false));
  }, [page, search, typeFilter, crFilter]);

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading monsters...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Monsters</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search monsters..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className={inputClass}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">All Types</option>
          {MONSTER_TYPES.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={crFilter} onChange={e => setCrFilter(e.target.value)} className={inputClass}>
          <option value="">All CRs</option>
          {CHALLENGE_RATINGS.map(cr => (
            <option key={cr} value={cr}>
              CR {cr}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {total} monster{total !== 1 ? 's' : ''} found
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {monsters.map(m => (
          <div
            key={m.id}
            className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <h3 className="font-semibold text-gray-900 dark:text-white">{m.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {m.size} {m.type} &middot; {m.alignment}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center text-sm">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">CR</div>
                <div className="font-medium text-gray-900 dark:text-white">{m.challengeRating}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">HP</div>
                <div className="font-medium text-gray-900 dark:text-white">{m.hitPoints}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400">AC</div>
                <div className="font-medium text-gray-900 dark:text-white">{m.armorClass}</div>
              </div>
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
