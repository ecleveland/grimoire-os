'use client';

import { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdSpell } from '@/lib/types';

export default function SpellListPage() {
  const [spells, setSpells] = useState<SrdSpell[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  useEffect(() => {
    apiFetch<SrdSpell[]>('/srd/spells')
      .then(setSpells)
      .catch((err) => {
        console.error('Failed to load spells:', err);
        toast.error('Failed to load spells');
      })
      .finally(() => setLoading(false));
  }, []);

  const classes = useMemo(() => {
    const set = new Set<string>();
    spells.forEach((s) => s.classes.forEach((c) => set.add(c)));
    return Array.from(set).sort();
  }, [spells]);

  const levels = useMemo(() => {
    const set = new Set<number>();
    spells.forEach((s) => set.add(s.level));
    return Array.from(set).sort((a, b) => a - b);
  }, [spells]);

  const filtered = useMemo(() => {
    return spells.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (classFilter && !s.classes.includes(classFilter)) return false;
      if (levelFilter !== '' && s.level !== Number(levelFilter)) return false;
      return true;
    });
  }, [spells, search, classFilter, levelFilter]);

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading spells...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Spells</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search spells..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass}
        />
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className={inputClass}>
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className={inputClass}>
          <option value="">All Levels</option>
          {levels.map((l) => (
            <option key={l} value={l}>{l === 0 ? 'Cantrip' : `Level ${l}`}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{filtered.length} spell{filtered.length !== 1 ? 's' : ''} found</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((s) => (
          <div key={s.id} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
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
    </div>
  );
}
