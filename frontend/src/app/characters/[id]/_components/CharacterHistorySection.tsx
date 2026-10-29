'use client';

import { useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import ConfirmDialog from '@/components/ConfirmDialog';
import Modal from '@/components/Modal';
import type { Character, CharacterSnapshotSummary } from '@/lib/types';
import { formatSnapshotDate } from './utils';

interface CharacterHistorySectionProps {
  character: Character;
  isOwner: boolean;
}

const primaryButtonClass =
  'px-3 py-1 text-xs font-medium rounded text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50';
const mutedTextClass = 'text-sm text-gray-500 dark:text-gray-400';

/** One row's visible text: level, then the label when there is one, then the date. */
function describeSnapshot(snapshot: CharacterSnapshotSummary): string {
  const label = snapshot.label ? ` · ${snapshot.label}` : '';
  return `Level ${snapshot.level}${label} · ${formatSnapshotDate(snapshot.takenAt)}`;
}

/**
 * The owner's saved copies of this sheet, newest first. The backend keeps one
 * automatically at every level-up, and the owner can save more here, open any
 * one as a read-only sheet, or delete it.
 * Level-ups refresh the list because the character write invalidates every
 * cached path under `/characters/:id`, this one included.
 */
export default function CharacterHistorySection({
  character,
  isOwner,
}: CharacterHistorySectionProps) {
  const queryClient = useQueryClient();
  const labelInputId = useId();
  const [saveOpen, setSaveOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [pendingDelete, setPendingDelete] = useState<CharacterSnapshotSummary | null>(null);

  const path = `/characters/${character.id}/snapshots`;
  const snapshotsQuery = useApiQuery<CharacterSnapshotSummary[]>(path, {
    enabled: isOwner,
    errorToast: 'Failed to load snapshots',
  });

  const refetchSnapshots = (after: string) => {
    // Best-effort: a failed refetch must not surface as an unobserved rejection.
    invalidateApiPath(queryClient, path).catch(err =>
      console.error(`Failed to refetch snapshots after ${after}:`, err)
    );
  };

  const closeSaveDialog = () => {
    setSaveOpen(false);
    setLabel('');
  };

  const save = useApiMutation<CharacterSnapshotSummary, string | undefined>(
    snapshotLabel =>
      apiFetch<CharacterSnapshotSummary>(path, {
        method: 'POST',
        body: JSON.stringify(snapshotLabel ? { label: snapshotLabel } : {}),
      }),
    {
      onSuccess: () => {
        toast.success('Saved snapshot');
        closeSaveDialog();
        refetchSnapshots('save');
      },
      onError: err => {
        console.error('Failed to save snapshot:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to save snapshot');
      },
    }
  );

  const remove = useApiMutation<void, string>(
    snapshotId => apiFetch<void>(`${path}/${snapshotId}`, { method: 'DELETE' }),
    {
      onSuccess: () => {
        toast.success('Snapshot deleted');
        refetchSnapshots('delete');
      },
      onError: err => {
        console.error('Failed to delete snapshot:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to delete snapshot');
      },
    }
  );

  if (!isOwner) return null;

  const busy = save.isPending || remove.isPending;
  const snapshots = snapshotsQuery.data ?? [];

  const submitSave = (e: FormEvent) => {
    e.preventDefault();
    if (save.isPending) return;
    save.mutate(label.trim() || undefined);
  };

  return (
    <div
      data-testid="character-history"
      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase">
          History
        </h3>
        <button
          type="button"
          onClick={() => setSaveOpen(true)}
          disabled={busy}
          className={primaryButtonClass}
        >
          Save snapshot
        </button>
      </div>

      {snapshotsQuery.isPending && <p className={mutedTextClass}>Loading…</p>}

      {/* Gated on success, so a failed fetch (toasted above) never claims the list is empty. */}
      {snapshotsQuery.isSuccess && snapshots.length === 0 && (
        <p className={mutedTextClass}>
          No snapshots yet. One is saved automatically at every level-up.
        </p>
      )}

      {snapshots.length > 0 && (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {snapshots.map(snapshot => (
            <li
              key={snapshot.id}
              data-testid="snapshot-row"
              className="flex items-center justify-between gap-2 py-2 text-sm"
            >
              <span className="text-gray-900 dark:text-gray-100">{describeSnapshot(snapshot)}</span>
              <div className="flex items-center gap-2">
                <Link
                  href={`/characters/${character.id}/history/${snapshot.id}`}
                  aria-label={`View snapshot ${describeSnapshot(snapshot)}`}
                  className="px-2 py-1 text-xs font-medium rounded text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20"
                >
                  View
                </Link>
                <button
                  type="button"
                  onClick={() => setPendingDelete(snapshot)}
                  disabled={busy}
                  aria-label={`Delete snapshot ${describeSnapshot(snapshot)}`}
                  className="px-2 py-1 text-xs font-medium rounded text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {saveOpen && (
        <Modal open onClose={closeSaveDialog} label="Save snapshot" testId="save-snapshot-dialog">
          <form onSubmit={submitSave} className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Save snapshot</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Keeps a copy of the sheet as it stands now.
              </p>
            </div>
            <div>
              <label
                htmlFor={labelInputId}
                className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-1"
              >
                Label
              </label>
              <input
                id={labelInputId}
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Before the dragon fight"
                maxLength={60}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={closeSaveDialog}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={save.isPending}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete snapshot?"
        description={
          pendingDelete ? `${describeSnapshot(pendingDelete)} will be gone for good.` : ''
        }
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete.id);
        }}
      />
    </div>
  );
}
