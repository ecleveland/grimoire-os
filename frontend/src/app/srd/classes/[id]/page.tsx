'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Badge from '@/components/Badge';
import ClassDetail from '@/components/ClassDetail';
import ConfirmDialog from '@/components/ConfirmDialog';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { apiQueryKey, invalidateApiPath, useApiQuery } from '@/lib/query';
import type { SrdClass, SrdSubclass } from '@/lib/types';

/** The detail GET includes the class's subclasses, which the list payload leaves out. */
type ClassWithSubclasses = SrdClass & { subclasses?: SrdSubclass[] };

export default function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, user } = useAuth();
  const [deleted, setDeleted] = useState(false);
  const query = useApiQuery<ClassWithSubclasses | null>(`/srd/classes/${id}`, {
    errorToast: { message: 'Failed to load class', id: 'load-class' },
    enabled: !deleted,
  });
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const cls = query.data;

  const backLink = (
    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
      <Link
        href="/srd/classes"
        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700"
      >
        ← Classes
      </Link>
    </p>
  );

  if (deleted) {
    return (
      <div>
        {backLink}
        <p className="text-gray-500 dark:text-gray-400">Class deleted.</p>
      </div>
    );
  }

  // The API answers null for a class the caller can't see, which covers hidden and
  // deleted classes. An error with nothing loaded is a failed request, so the page
  // offers a retry instead of calling the class missing. A failed background
  // refetch keeps the loaded class on screen.
  if (cls === null) {
    return (
      <div>
        {backLink}
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Class not found.</p>
          <Link
            href="/srd/classes"
            className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Back to classes
          </Link>
        </div>
      </div>
    );
  }

  if (query.isError && cls === undefined) {
    return (
      <div>
        {backLink}
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">Failed to load class.</p>
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

  if (cls === undefined) {
    return (
      <div>
        {backLink}
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading class…</p>
      </div>
    );
  }

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManage =
    (cls.contentSource === 'homebrew' && cls.createdById === user?.userId) ||
    (cls.contentSource === 'shared' && isAdmin);

  const subclasses = cls.subclasses ?? [];

  const handleDelete = async () => {
    try {
      await apiFetch(`/srd/classes/${id}`, { method: 'DELETE' });
      // The page stays mounted until the navigation lands. Disabling the query keeps
      // the next render from fetching the deleted id again, and removing its cache
      // entry before the list refresh keeps that refresh from refetching it too. A
      // later visit to this URL then starts empty instead of from a stale copy.
      setDeleted(true);
      toast.success(`Deleted ${cls.name}`);
      router.push('/srd/classes');
      queryClient.removeQueries({ queryKey: apiQueryKey(`/srd/classes/${id}`), exact: true });
      await invalidateApiPath(queryClient, '/srd/classes');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete class');
    }
  };

  return (
    <div>
      {backLink}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {cls.name}
            {cls.contentSource === 'homebrew' && (
              <Badge variant="homebrew" className="ml-2 inline-block align-middle">
                Homebrew
              </Badge>
            )}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Hit Die: {cls.hitDie}
            {cls.primaryAbilities.length > 0 && <> &middot; {cls.primaryAbilities.join(', ')}</>}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/srd/classes/${id}/edit`}
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
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <ClassDetail cls={cls} />
      </div>

      {subclasses.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Subclasses</h2>
          {cls.subclassLevel != null && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Chosen at level {cls.subclassLevel}.
            </p>
          )}
          <div className="mt-3 space-y-3">
            {subclasses.map(sc => (
              <div
                key={sc.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
              >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{sc.name}</h3>
                {sc.description && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{sc.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title="Delete class?"
        description={`"${cls.name}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete class"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
