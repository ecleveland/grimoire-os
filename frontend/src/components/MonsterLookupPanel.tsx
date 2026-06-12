'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import type { SrdMonster } from '@/lib/types';
import Modal from '@/components/Modal';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import AddToEncounterDialog, { type AddToEncounterResult } from '@/components/AddToEncounterDialog';
import MonsterSearchResults from '@/components/MonsterSearchResults';

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

      <div className="px-4 pb-4">
        <MonsterSearchResults
          limit={LIMIT}
          onPick={m => openMonster(m.id)}
          resultTestId="lookup-result"
        />
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
