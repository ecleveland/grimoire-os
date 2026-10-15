'use client';

import { useId, useState } from 'react';
import { useApiQuery } from '@/lib/query';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import type { PaginatedResponse, SrdSpell } from '@grimoire-os/shared';

const LIMIT = 8;

interface Props {
  /** Fired with the chosen catalog spell; the search clears afterwards. */
  onSelect: (spell: SrdSpell) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Reusable debounced picker over the spell catalog (`GET /srd/spells`, which
 * spans srd/shared and the caller's homebrew). The spell-catalog sibling of
 * `CatalogItemPicker`. It reads through `useApiQuery`, so consumers render
 * inside the app's QueryProvider and tests use `renderWithQueryClient`. Picking
 * a spell fires `onSelect` with the full catalog row so the caller can map it
 * to a structured SpellEntry (via `toSpellEntry`).
 */
export default function SrdSpellSearch({ onSelect, placeholder, disabled = false }: Props) {
  const inputId = useId();
  const [searchInput, setSearchInput] = useState('');
  const query = useDebouncedValue(searchInput.trim());

  const params = new URLSearchParams({ q: query, page: '1', limit: String(LIMIT) });
  const search = useApiQuery<PaginatedResponse<SrdSpell>>(`/srd/spells?${params.toString()}`, {
    enabled: query !== '',
    errorToast: 'Failed to search spells',
  });
  const results = search.data?.data ?? [];
  const loading = query !== '' && search.isPending;

  const pick = (spell: SrdSpell) => {
    onSelect(spell);
    setSearchInput('');
  };

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        Search the spell catalog
      </label>
      <input
        id={inputId}
        type="text"
        placeholder={placeholder ?? 'Search the spell catalog…'}
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
        ) : results.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            No matching spells for &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <ul className="mt-2 space-y-1">
            {results.map(spell => (
              <li key={spell.id}>
                <button
                  type="button"
                  aria-label={`Add ${spell.name}`}
                  onClick={() => pick(spell)}
                  className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                >
                  <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {spell.name}
                  </span>
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {spell.level === 0 ? 'Cantrip' : `Lvl ${spell.level}`} · {spell.school}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
