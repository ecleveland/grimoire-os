'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdMonster, PaginatedResponse } from '@/lib/types';
import Modal from '@/components/Modal';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import { formatCr } from '@/lib/srd-format';

const LIMIT = 8;

/**
 * Read-only monster reference for the encounter tracker (VEG-259): debounced
 * search against `/srd/monsters`, compact results, and the shared stat-block
 * overlay (VEG-257) on selection. Mutating actions ("add to encounter") arrive
 * in VEG-260. Collapsible so it stays unobtrusive below the tracker on mobile.
 */
export default function MonsterLookupPanel() {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SrdMonster[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<SrdMonster | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the raw input into the query that drives the fetch.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Only hit the API once there's something to search for.
  useEffect(() => {
    if (!query) {
      setResults([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ q: query, page: '1', limit: String(LIMIT) });
    apiFetch<PaginatedResponse<SrdMonster>>(`/srd/monsters?${params.toString()}`)
      .then(res => {
        setResults(res.data);
        setTotal(res.total);
      })
      .catch(err => {
        console.error('Failed to search monsters:', err);
        toast.error('Failed to search monsters', { id: 'lookup-search' });
      })
      .finally(() => setLoading(false));
  }, [query]);

  function openMonster(id: string) {
    setDetail(null);
    setDetailLoading(true);
    setDetailOpen(true);
    apiFetch<SrdMonster>(`/srd/monsters/${id}`)
      .then(setDetail)
      .catch(err => {
        console.error('Failed to load monster:', err);
        toast.error('Failed to load monster', { id: 'lookup-load-monster' });
        setDetailOpen(false);
      })
      .finally(() => setDetailLoading(false));
  }

  return (
    <details
      open
      className="mt-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
    >
      <summary className="cursor-pointer select-none px-4 py-3 font-semibold text-gray-900 dark:text-white">
        Monster Lookup
      </summary>

      <div className="px-4 pb-4 space-y-3">
        <input
          type="text"
          placeholder="Search monsters..."
          aria-label="Search monsters"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />

        {!query ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Type to search the monster compendium.
          </p>
        ) : loading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Searching…</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No monsters found for &ldquo;{query}&rdquo;.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {results.map(m => (
                <li key={m.id}>
                  <button
                    type="button"
                    data-testid="lookup-result"
                    onClick={() => openMonster(m.id)}
                    className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-gray-900 dark:text-white">
                        {m.name}
                      </span>
                      <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                        {m.size} {m.type}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                      CR {formatCr(m.challengeRating)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {total > results.length && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Showing {results.length} of {total}. Refine your search to narrow results.
              </p>
            )}
          </>
        )}
      </div>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        label={detail?.name ?? 'Monster'}
      >
        {detailLoading || !detail ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading monster…
          </p>
        ) : (
          <MonsterStatBlock monster={detail} />
        )}
      </Modal>
    </details>
  );
}
