'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApiQuery } from '@/lib/query';
import type { CharacterSnapshot } from '@/lib/types';
import CharacterSheet from '../../_components/CharacterSheet';
import { formatSnapshotDate } from '../../_components/utils';

/**
 * One saved copy of a character, drawn with the live sheet's components under
 * a banner that says which copy it is. The sheet always renders as a non-owner:
 * the backend only serves snapshots to the owner, and a snapshot is never
 * editable whoever looks at it.
 */
export default function CharacterSnapshotPage() {
  const { id, snapshotId } = useParams<{ id: string; snapshotId: string }>();
  const snapshotQuery = useApiQuery<CharacterSnapshot>(
    `/characters/${id}/snapshots/${snapshotId}`,
    { errorToast: 'Failed to load snapshot' }
  );
  const snapshot = snapshotQuery.data;

  if (snapshotQuery.isPending)
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!snapshot) return <div className="text-gray-500 dark:text-gray-400">Snapshot not found.</div>;

  const label = snapshot.label ? ` as "${snapshot.label}"` : '';
  const description = `${snapshot.data.name} at level ${snapshot.level}, saved ${formatSnapshotDate(snapshot.takenAt)}${label}. Read only.`;

  return (
    <>
      <div
        role="status"
        data-testid="snapshot-banner"
        className="max-w-5xl mx-auto mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20 px-4 py-3 text-sm text-gray-900 dark:text-gray-100 flex flex-wrap items-center justify-between gap-2"
      >
        <p>{description}</p>
        <Link
          href={`/characters/${id}`}
          className="text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
        >
          Back to the current sheet
        </Link>
      </div>
      <CharacterSheet character={snapshot.data} isOwner={false} />
    </>
  );
}
