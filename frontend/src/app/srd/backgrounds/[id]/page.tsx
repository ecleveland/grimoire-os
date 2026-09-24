'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Badge from '@/components/Badge';
import BackgroundDetail, { BackgroundSubtitle } from '@/components/BackgroundDetail';
import ConfirmDialog from '@/components/ConfirmDialog';
import PrintToggle from '@/components/PrintToggle';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { apiQueryKey, invalidateApiPath, useApiQuery } from '@/lib/query';
import type { SrdBackground } from '@/lib/types';

export default function BackgroundDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, user } = useAuth();
  const [deleted, setDeleted] = useState(false);
  const query = useApiQuery<SrdBackground | null>(`/srd/backgrounds/${id}`, {
    errorToast: { message: 'Failed to load background', id: 'load-background' },
    enabled: !deleted,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const bg = query.data;

  const backLink = (
    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
      <Link
        href="/srd/backgrounds"
        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
      >
        ← Backgrounds
      </Link>
    </p>
  );

  if (deleted) {
    return (
      <div>
        {backLink}
        <p className="text-gray-500 dark:text-gray-400">Background deleted.</p>
      </div>
    );
  }

  // The API answers null for a background the caller can't see, which covers hidden
  // and deleted backgrounds. An error with nothing loaded is a failed request, so the
  // page offers a retry instead of calling the background missing. A failed background
  // refetch keeps the loaded background on screen.
  if (bg === null) {
    return (
      <div>
        {backLink}
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Background not found.</p>
          <Link
            href="/srd/backgrounds"
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Back to backgrounds
          </Link>
        </div>
      </div>
    );
  }

  if (query.isError && bg === undefined) {
    return (
      <div>
        {backLink}
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Failed to load background.</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (bg === undefined) {
    return (
      <div>
        {backLink}
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading background…</p>
      </div>
    );
  }

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManage =
    (bg.contentSource === 'homebrew' && bg.createdById === user?.userId) ||
    (bg.contentSource === 'shared' && isAdmin);

  const handleDelete = async () => {
    try {
      await apiFetch(`/srd/backgrounds/${id}`, { method: 'DELETE' });
      // The page stays mounted until the navigation lands. Disabling the query keeps
      // the next render from fetching the deleted id again, and removing its cache
      // entry before the list refresh keeps that refresh from refetching it too. A
      // later visit to this URL then starts empty instead of from a stale copy.
      setDeleted(true);
      toast.success(`Deleted ${bg.name}`);
      router.push('/srd/backgrounds');
      queryClient.removeQueries({ queryKey: apiQueryKey(`/srd/backgrounds/${id}`), exact: true });
      await invalidateApiPath(queryClient, '/srd/backgrounds');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete background');
    }
  };

  return (
    <div>
      {backLink}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {bg.name}
            {bg.contentSource === 'homebrew' && (
              <Badge variant="homebrew" className="ml-2 inline-block align-middle">
                Homebrew
              </Badge>
            )}
          </h1>
          <BackgroundSubtitle background={bg} className="mt-1" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PrintToggle type="background" id={bg.id} name={bg.name} />
          {canManage && (
            <>
              <Link
                href={`/srd/backgrounds/${id}/edit`}
                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Edit
              </Link>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <BackgroundDetail background={bg} headingLevel={2} />
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete background?"
        description={`"${bg.name}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete background"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
