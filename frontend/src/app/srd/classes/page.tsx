'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useQueryClient } from '@tanstack/react-query';
import { useApiQuery, invalidateApiPath } from '@/lib/query';
import Collapsible from '@/components/Collapsible';
import ClassDetail from '@/components/ClassDetail';
import CreateEntityLink from '@/components/CreateEntityLink';
import ConfirmDialog from '@/components/ConfirmDialog';
import Badge from '@/components/Badge';
import type { SrdClass } from '@/lib/types';

/** Client-side, because only the credentialed fetch returns the caller's homebrew classes. */
export default function ClassListPage() {
  const { isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  const classesQuery = useApiQuery<SrdClass[]>('/srd/classes', {
    errorToast: { message: 'Failed to load classes', id: 'load-classes' },
  });
  const [pendingDelete, setPendingDelete] = useState<SrdClass | null>(null);

  // Every feature the API returns carries a row id, so an id-less one means the
  // backend contract regressed and its print toggle has quietly become an inert
  // chip. Logged per payload, because the page re-renders whenever the delete
  // dialog opens or closes.
  useEffect(() => {
    const idless = (classesQuery.data ?? []).flatMap(cls => cls.features).filter(f => !f.id);
    if (idless.length > 0) {
      console.error(
        'srd/classes: class features rendered without an id, print toggle unavailable (backend contract regression):',
        idless.map(f => f.name)
      );
    }
  }, [classesQuery.data]);

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManage = (cls: SrdClass) =>
    (cls.contentSource === 'homebrew' && cls.createdById === user?.userId) ||
    (cls.contentSource === 'shared' && isAdmin);

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await apiFetch(`/srd/classes/${pendingDelete.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${pendingDelete.name}`);
      await invalidateApiPath(queryClient, '/srd/classes');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete class');
    }
  }

  if (classesQuery.isError) {
    return (
      <div className="text-red-600 dark:text-red-400">
        Failed to load classes. Please try again later.
      </div>
    );
  }

  const classes = classesQuery.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Classes</h1>
        <CreateEntityLink href="/srd/classes/new" label="Create class" />
      </div>
      {classesQuery.isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading classes…</p>
      ) : (
        <div className="space-y-4">
          {classes.map(cls => (
            <Collapsible
              key={cls.id}
              summary={
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {cls.name}
                    {cls.contentSource === 'homebrew' && (
                      <Badge variant="homebrew" className="ml-2 inline-block align-middle">
                        Homebrew
                      </Badge>
                    )}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Hit Die: {cls.hitDie}
                    {cls.primaryAbilities.length > 0 && (
                      <> &middot; {cls.primaryAbilities.join(', ')}</>
                    )}
                  </p>
                </div>
              }
            >
              <ClassDetail cls={cls} />
              {/* The summary is a button, so the page link lives in the card body. */}
              <div className="flex items-center gap-2 pt-2">
                <Link
                  href={`/srd/classes/${cls.id}`}
                  className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Open class page
                </Link>
                {canManage(cls) && (
                  <div className="ml-auto flex items-center gap-2">
                    <Link
                      href={`/srd/classes/${cls.id}/edit`}
                      className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(cls)}
                      className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </Collapsible>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete class?"
        description={`"${pendingDelete?.name ?? 'This class'}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete class"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
