'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import MonsterForm from '@/components/MonsterForm';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { MonsterPayload } from '@/lib/monster-form';
import { invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import type { SrdMonster } from '@/lib/types';

export default function EditMonsterPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, user, isLoading: authLoading } = useAuth();

  const query = useApiQuery<SrdMonster | null>(`/srd/monsters/${id}`, {
    errorToast: 'Failed to load monster',
  });

  const mutation = useApiMutation(
    (payload: MonsterPayload) =>
      apiFetch<SrdMonster>(`/srd/monsters/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    {
      onSuccess: () => {
        toast.success('Monster updated');
        // The prefix also matches this page's own detail key, so the refetch is
        // left to run in the background rather than holding up the navigation.
        void invalidateApiPath(queryClient, '/srd/monsters');
        router.push('/srd/monsters');
      },
      onError: err => {
        console.error('Failed to update monster:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to update monster');
      },
    }
  );

  const monster = query.data;

  // The detail endpoint returns null for ids outside the caller's visibility
  // (missing, or someone else's homebrew), so treat that as a failed load rather
  // than rendering an empty editable form (VEG-317). A background reload that
  // fails after the monster loaded keeps the form and its unsaved changes, and a retry
  // in flight shows the loading state.
  if (!query.isFetching && (monster === null || (query.isError && monster === undefined)))
    return <LoadError message="Failed to load monster." onRetry={() => query.refetch()} />;
  // Wait for both the monster load and session hydration before judging edit rights:
  // the monster's GET can resolve before `user`/`isAdmin` hydrate, and evaluating
  // canEdit then would falsely deny a legitimate owner/admin (VEG-320).
  if (authLoading || !monster) return <LoadingState />;

  const canEdit =
    (monster.contentSource === 'homebrew' && monster.createdById === user?.userId) ||
    (monster.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew monsters.
        </p>
        <Link
          href="/srd/monsters"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to monsters
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Monster</h1>
      <MonsterForm
        initial={monster}
        submitting={mutation.isPending || mutation.isSuccess}
        submitLabel="Save changes"
        onSubmit={payload => mutation.mutate(payload)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
