'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type { PaginatedResponse, SrdItem } from '@grimoire-os/shared';

const LIMIT = 8;

interface Props {
  /** Fired with the chosen catalog item; the search clears afterwards. */
  onSelect: (item: SrdItem) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Reusable debounced picker over the item catalog (`GET /srd/items`, which
 * spans srd/shared and the caller's homebrew). Modeled on `LootItemsEditor`'s
 * search: plain `apiFetch` with a stale-response guard, so consumers can mock
 * `@/lib/api` without a react-query provider. Picking an item fires `onSelect`
 * with the full catalog row (name, weight, category, description) so the caller
 * can autofill a linked entry.
 */
export default function SrdItemSearch({ onSelect, placeholder, disabled = false }: Props) {
  const inputId = useId();
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
    // Stale guard: a slow response for an old query must not overwrite the
    // newer query's results or end its loading state.
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

  const pick = (item: SrdItem) => {
    onSelect(item);
    setSearchInput('');
    setQuery('');
    setResults([]);
  };

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        Search the item catalog
      </label>
      <input
        id={inputId}
        type="text"
        placeholder={placeholder ?? 'Search the item catalog…'}
        value={searchInput}
        disabled={disabled}
        onChange={e => setSearchInput(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
      />
      {query &&
        (loading ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
        ) : results.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No matching items for &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {results.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  aria-label={`Add ${item.name}`}
                  onClick={() => pick(item)}
                  className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                >
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {item.name}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {item.category}
                    {item.weight != null ? ` · ${item.weight} lb` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
