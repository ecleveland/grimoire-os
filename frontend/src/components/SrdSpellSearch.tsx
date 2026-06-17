'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
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
 * `SrdItemSearch`: plain `apiFetch` with a stale-response guard, so consumers
 * can mock `@/lib/api` without a react-query provider. Picking a spell fires
 * `onSelect` with the full catalog row so the caller can map it to a structured
 * SpellEntry (via `toSpellEntry`).
 */
export default function SrdSpellSearch({ onSelect, placeholder, disabled = false }: Props) {
  const inputId = useId();
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SrdSpell[]>([]);
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
    apiFetch<PaginatedResponse<SrdSpell>>(`/srd/spells?${params.toString()}`)
      .then(res => {
        if (!stale) setResults(res.data);
      })
      .catch(err => {
        if (stale) return;
        console.error('Spell search failed:', err);
        setResults([]);
        toast.error(err instanceof Error ? err.message : 'Failed to search spells');
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [query]);

  const pick = (spell: SrdSpell) => {
    onSelect(spell);
    setSearchInput('');
    setQuery('');
    setResults([]);
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
      {query &&
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
