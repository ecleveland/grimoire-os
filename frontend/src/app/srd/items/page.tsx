'use client';

import { useEffect, useState, useRef } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdItem, PaginatedResponse } from '@/lib/types';
import Pagination from '@/components/Pagination';

const LIMIT = 20;

const CATEGORIES = [
  'Ammunition',
  'Arcane Focus',
  'Armor',
  'Artisan Tools',
  'Druidic Focus',
  'Equipment Pack',
  'Gaming Set',
  'Heavy Armor',
  'Holy Symbol',
  'Light Armor',
  'Martial Melee',
  'Martial Ranged',
  'Medium Armor',
  'Mount',
  'Musical Instrument',
  'Other',
  'Potion',
  'Ring',
  'Rod',
  'Scroll',
  'Shield',
  'Simple Melee',
  'Simple Ranged',
  'Staff',
  'Tool',
  'Vehicle',
  'Wand',
  'Weapon',
  'Wondrous Item',
];

export default function ItemListPage() {
  const [items, setItems] = useState<SrdItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (search) params.set('q', search);
    if (categoryFilter) params.set('category', categoryFilter);

    apiFetch<PaginatedResponse<SrdItem>>(`/srd/items?${params.toString()}`)
      .then(res => {
        setItems(res.data);
        setTotal(res.total);
        setLastPage(res.lastPage);
      })
      .catch(err => {
        console.error('Failed to load items:', err);
        toast.error('Failed to load items', { id: 'load-items' });
      })
      .finally(() => setLoading(false));
  }, [page, search, categoryFilter]);

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setPage(1);
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  if (loading && items.length === 0)
    return <div className="text-gray-500 dark:text-gray-400">Loading items...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Items</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search items..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className={inputClass}
        />
        <select
          value={categoryFilter}
          onChange={e => handleCategoryChange(e.target.value)}
          className={inputClass}
        >
          <option value="">All Categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {total} item{total !== 1 ? 's' : ''} found
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(item => (
          <div
            key={item.id}
            className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
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
                {item.properties.map(p => (
                  <span
                    key={p}
                    className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                  >
                    {p}
                  </span>
                ))}
              </div>
            )}
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
