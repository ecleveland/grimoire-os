'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type {
  LootRange,
  LootTemplateItemEntry,
  PaginatedResponse,
  SrdItem,
} from '@grimoire-os/shared';

const LIMIT = 8;

const numberInputClass =
  'w-20 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

interface Props {
  value: LootTemplateItemEntry[];
  onChange: (next: LootTemplateItemEntry[]) => void;
}

/**
 * Structured editor for a loot template's weighted item entries (VEG-303).
 * New entries are picked from the items catalog via a debounced
 * `/srd/items` search — generation resolves entries to catalog ids by exact
 * `Item.name`, so free-typed names would silently produce id-less loot.
 * Weights are floored to ≥ 0 and qty ranges stay ordered with min ≥ 1.
 */
export default function LootItemsEditor({ value, onChange }: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SrdItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the raw input into the query that drives the fetch.
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
    const params = new URLSearchParams({ q: query, page: '1', limit: String(LIMIT) });
    apiFetch<PaginatedResponse<SrdItem>>(`/srd/items?${params.toString()}`)
      .then(res => setResults(res.data))
      .catch(() => toast.error('Failed to search items'))
      .finally(() => setLoading(false));
  }, [query]);

  const addItem = (item: SrdItem) => {
    onChange([...value, { itemName: item.name, weight: 1, qty: [1, 1] }]);
    setSearchInput('');
    setQuery('');
    setResults([]);
  };

  const updateEntry = (index: number, entry: LootTemplateItemEntry) => {
    onChange(value.map((e, i) => (i === index ? entry : e)));
  };

  const handleWeight = (index: number, raw: string) => {
    const weight = Math.max(0, Number(raw) || 0);
    updateEntry(index, { ...value[index], weight });
  };

  const handleQty = (index: number, bound: 'min' | 'max', raw: string) => {
    const parsed = Math.max(1, Math.floor(Number(raw) || 1));
    const [min, max] = value[index].qty;
    const qty: LootRange =
      bound === 'min' ? [parsed, Math.max(parsed, max)] : [Math.min(min, parsed), parsed];
    updateEntry(index, { ...value[index], qty });
  };

  const removeEntry = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const inList = new Set(value.map(e => e.itemName));
  const pickable = results.filter(r => !inList.has(r.name));

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No items yet — search the catalog below to add one.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((entry, index) => (
            <li key={entry.itemName} className="flex flex-wrap items-center gap-2">
              <span className="w-32 truncate text-sm font-medium text-gray-900 dark:text-white">
                {entry.itemName}
              </span>
              <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                weight
                <input
                  type="number"
                  min={0}
                  aria-label={`${entry.itemName} weight`}
                  value={entry.weight}
                  onChange={e => handleWeight(index, e.target.value)}
                  className={numberInputClass}
                />
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                qty
                <input
                  type="number"
                  min={1}
                  aria-label={`${entry.itemName} qty min`}
                  value={entry.qty[0]}
                  onChange={e => handleQty(index, 'min', e.target.value)}
                  className={numberInputClass}
                />
              </label>
              <span className="text-xs text-gray-500 dark:text-gray-400">to</span>
              <input
                type="number"
                min={1}
                aria-label={`${entry.itemName} qty max`}
                value={entry.qty[1]}
                onChange={e => handleQty(index, 'max', e.target.value)}
                className={numberInputClass}
              />
              <button
                type="button"
                aria-label={`Remove ${entry.itemName}`}
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
