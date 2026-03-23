'use client';

import { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdMonster } from '@/lib/types';

export default function MonsterListPage() {
  const [monsters, setMonsters] = useState<SrdMonster[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [crFilter, setCrFilter] = useState('');

  useEffect(() => {
    apiFetch<SrdMonster[]>('/srd/monsters')
      .then(setMonsters)
      .catch((err) => {
        console.error('Failed to load monsters:', err);
        toast.error('Failed to load monsters', { id: 'load-monsters' });
      })
      .finally(() => setLoading(false));
  }, []);

  const types = useMemo(() => {
    const set = new Set<string>();
    monsters.forEach((m) => set.add(m.type));
    return Array.from(set).sort();
  }, [monsters]);

  const crs = useMemo(() => {
    const set = new Set<string>();
    monsters.forEach((m) => set.add(m.challengeRating));
    return Array.from(set).sort((a, b) => {
      const toNum = (v: string) => {
        if (v.includes('/')) {
          const [num, den] = v.split('/');
          return Number(num) / Number(den);
        }
        return Number(v);
      };
      return toNum(a) - toNum(b);
    });
  }, [monsters]);

  const filtered = useMemo(() => {
    return monsters.filter((m) => {
      if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter && m.type !== typeFilter) return false;
      if (crFilter && m.challengeRating !== crFilter) return false;
      return true;
    });
  }, [monsters, search, typeFilter, crFilter]);

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
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass}
        />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputClass}>
          <option value="">All Types</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={crFilter} onChange={(e) => setCrFilter(e.target.value)} className={inputClass}>
          <option value="">All CRs</option>
          {crs.map((cr) => (
            <option key={cr} value={cr}>CR {cr}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{filtered.length} monster{filtered.length !== 1 ? 's' : ''} found</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((m) => (
          <div key={m.id} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
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
    </div>
  );
}
