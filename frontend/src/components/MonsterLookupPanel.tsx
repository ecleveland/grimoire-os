'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdMonster } from '@/lib/types';
import Modal from '@/components/Modal';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import AddToEncounterDialog, { type AddToEncounterResult } from '@/components/AddToEncounterDialog';
import { formatCr } from '@/lib/srd-format';
import { useMonsterSearch } from '@/lib/use-monster-search';

const LIMIT = 8;

interface Props {
  /** When true, the stat-block overlay exposes an "Add to encounter" CTA (DM only). */
  canAdd?: boolean;
  /** Appends the monster to the current encounter; the panel awaits it before closing. */
  onAdd?: (monster: SrdMonster, result: AddToEncounterResult) => Promise<void> | void;
}

/**
 * Read-only monster reference for the encounter tracker (VEG-259): debounced
 * search against `/srd/monsters`, compact results, and the shared stat-block
 * overlay (VEG-257) on selection. With `canAdd` (VEG-260) the overlay also lets
 * a DM add the monster to the current encounter. Collapsible so it stays
 * unobtrusive below the tracker on mobile.
 */
export default function MonsterLookupPanel({ canAdd = false, onAdd }: Props) {
  const { searchInput, setSearchInput, query, results, total, loading } = useMonsterSearch(LIMIT);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<SrdMonster | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  function openMonster(id: string) {
    setDetail(null);
    setDetailLoading(true);
    setDetailOpen(true);
    setAdding(false);
    apiFetch<SrdMonster>(`/srd/monsters/${id}`)
      .then(setDetail)
      .catch(err => {
        console.error('Failed to load monster:', err);
        toast.error('Failed to load monster', { id: 'lookup-load-monster' });
        setDetailOpen(false);
      })
      .finally(() => setDetailLoading(false));
  }

  async function handleAdd(monster: SrdMonster, result: AddToEncounterResult) {
    if (!onAdd) return;
    setSubmitting(true);
    try {
      await onAdd(monster, result);
      setDetailOpen(false);
      setAdding(false);
    } finally {
      setSubmitting(false);
    }
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
        ) : adding ? (
          <AddToEncounterDialog
            monster={detail}
            submitting={submitting}
            onConfirm={result => handleAdd(detail, result)}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <div className="space-y-3">
            {canAdd && onAdd && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Add to encounter
                </button>
              </div>
            )}
            <MonsterStatBlock monster={detail} />
          </div>
        )}
      </Modal>
    </details>
  );
}
