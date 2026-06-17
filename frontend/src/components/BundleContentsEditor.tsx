'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type { PaginatedResponse, SrdItem, SrdItemBundleComponent } from '@/lib/types';

const LIMIT = 8;

const numberInputClass =
  'w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

interface Props {
  value: SrdItemBundleComponent[];
  onChange: (next: SrdItemBundleComponent[]) => void;
  /** Item id of the pack being edited — excluded from search so it can't contain itself. */
  selfId?: string;
}

/**
 * Editor for an equipment pack's bundle contents (VEG-309). Components are
 * picked from the items catalog via a debounced `/srd/items` search and stored
 * by catalog `itemId` (the backend persists `ItemBundleEntry.componentId`), with
 * a per-entry integer quantity ≥ 1. Mirrors {@link LootItemsEditor}'s catalog
 * picker; the pack itself is filtered out so it cannot contain itself.
 */
export default function BundleContentsEditor({ value, onChange, selfId }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SrdItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Stale guard: a slow response for an old query must not overwrite newer results.
    let stale = false;
    const params = new URLSearchParams({ q: query, page: '1', limit: String(LIMIT) });
    apiFetch<PaginatedResponse<SrdItem>>(`/srd/items?${params.toString()}`)
      .then(res => {
        if (!stale) setResults(res.data);
      })
      .catch(err => {
        if (stale) return;
        console.error('Item search failed:', err);
        setResults([]);
        toast.error(err instanceof Error ? err.message : 'Failed to search items');
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [query]);

  const addItem = (item: SrdItem) => {
    onChange([...value, { itemId: item.id, name: item.name, quantity: 1 }]);
    setSearchInput('');
    setQuery('');
    setResults([]);
  };

  const setQuantity = (index: number, quantity: number) => {
    onChange(value.map((e, i) => (i === index ? { ...e, quantity } : e)));
  };

  const removeEntry = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const inList = new Set(value.map(e => e.itemId));
  const pickable = results.filter(r => !inList.has(r.id) && r.id !== selfId);

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No contents yet — search the catalog below to add an item.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((entry, index) => (
            <li key={entry.itemId} className="flex flex-wrap items-center gap-2">
              <span className="w-40 truncate text-sm font-medium text-gray-900 dark:text-white">
                {entry.name}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">qty</span>
              <input
                type="number"
                min={1}
                aria-label={`${entry.name} quantity`}
                value={entry.quantity}
                onChange={e => {
                  const n = Math.max(1, Math.floor(Number(e.target.value) || 1));
                  setQuantity(index, n);
                }}
                className={numberInputClass}
              />
              <button
                type="button"
                aria-label={`Remove ${entry.name}`}
                onClick={() => removeEntry(index)}
                className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <input
          type="text"
          aria-label="Search items"
          placeholder="Search items to add…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
        {query &&
          (loading ? (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
          ) : pickable.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No matching items for &ldquo;{query}&rdquo;.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {pickable.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-label={`Add ${item.name}`}
                    onClick={() => addItem(item)}
                    className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                      {item.name}
                    </span>
                    <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {item.category}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
