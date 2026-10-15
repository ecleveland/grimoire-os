'use client';

import { useId, useState } from 'react';
import { useApiQuery } from '@/lib/query';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { PaginatedResponse, SrdItem } from '@grimoire-os/shared';

const LIMIT = 8;

export interface CatalogItemPickerProps {
  /** Fired with the chosen catalog item; the search clears afterwards. */
  onSelect: (item: SrdItem) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * `global` limits the search to the SRD and shared catalog, leaving out the
   * caller's homebrew. The server applies it, so a page of homebrew cannot
   * crowd catalog rows out of the results.
   */
  tier?: 'global';
  /** Hides results the caller cannot take, such as items already in its list. */
  exclude?: (item: SrdItem) => boolean;
  /** The input's accessible name. */
  inputLabel?: string;
}

/**
 * Debounced picker over the item catalog (`GET /srd/items`, which spans
 * srd/shared and the caller's homebrew unless `tier` narrows it). It reads
 * through `useApiQuery`, so consumers render inside the app's QueryProvider and
 * tests use `renderWithQueryClient`. Picking an item fires `onSelect` with the
 * full catalog row (name, weight, category, description) so the caller can
 * autofill a linked entry.
 */
export default function CatalogItemPicker({
  onSelect,
  placeholder,
  disabled = false,
  tier,
  exclude,
  inputLabel = 'Search the item catalog',
}: CatalogItemPickerProps) {
  const inputId = useId();
  const [searchInput, setSearchInput] = useState('');
  const query = useDebouncedValue(searchInput.trim());

  const params = new URLSearchParams({ q: query, page: '1', limit: String(LIMIT) });
  if (tier) params.set('tier', tier);
  const search = useApiQuery<PaginatedResponse<SrdItem>>(`/srd/items?${params.toString()}`, {
    enabled: query !== '',
    errorToast: 'Failed to search items',
  });
  const results = search.data?.data ?? [];
  const loading = query !== '' && search.isPending;

  const pick = (item: SrdItem) => {
    onSelect(item);
    setSearchInput('');
  };

  const shown = exclude ? results.filter(item => !exclude(item)) : results;

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        {inputLabel}
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
      {/* Gating on the raw input too hides the list the moment a pick clears it. */}
      {searchInput.trim() !== '' &&
        query !== '' &&
        (loading ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Searching…</p>
        ) : shown.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No matching items for &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {shown.map(item => (
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
