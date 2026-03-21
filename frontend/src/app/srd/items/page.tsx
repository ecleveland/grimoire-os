'use client';

import { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdItem } from '@/lib/types';

export default function ItemListPage() {
  const [items, setItems] = useState<SrdItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    apiFetch<SrdItem[]>('/srd/items')
      .then(setItems)
      .catch((err) => {
        console.error('Failed to load items:', err);
        toast.error('Failed to load items');
      })
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.category));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (categoryFilter && i.category !== categoryFilter) return false;
      return true;
    });
  }, [items, search, categoryFilter]);

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading items...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Items</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputClass}
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={inputClass}>
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{filtered.length} item{filtered.length !== 1 ? 's' : ''} found</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((item) => (
          <div key={item.id} className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white">{item.name}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{item.category}</p>
            <div className="flex gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
              {item.cost && <span>Cost: {item.cost}</span>}
              {item.weight && <span>Weight: {item.weight}</span>}
            </div>
            {item.damage && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Damage: {item.damage}</p>
            )}
            {item.properties.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.properties.map((p) => (
                  <span key={p} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
