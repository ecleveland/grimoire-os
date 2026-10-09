'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import SpellForm from '@/components/SpellForm';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { SpellPayload } from '@/lib/spell-form';
import { invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import type { SrdSpell } from '@/lib/types';

export default function EditSpellPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, user, isLoading: authLoading } = useAuth();

  const query = useApiQuery<SrdSpell | null>(`/srd/spells/${id}`, {
    errorToast: 'Failed to load spell',
  });

  const mutation = useApiMutation(
    (payload: SpellPayload) =>
      apiFetch<SrdSpell>(`/srd/spells/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    {
      onSuccess: () => {
        toast.success('Spell updated');
        // The prefix also matches this page's own detail key, so the refetch is
        // left to run in the background rather than holding up the navigation.
        void invalidateApiPath(queryClient, '/srd/spells');
        router.push('/srd/spells');
      },
      onError: err => {
        console.error('Failed to update spell:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to update spell');
      },
    }
  );

  const spell = query.data;

  // The detail endpoint returns null for ids outside the caller's visibility
  // (missing, or someone else's homebrew), so treat that as a failed load rather
  // than rendering an empty editable form (VEG-317). A background reload that
  // fails after the spell loaded keeps the form and its unsaved changes, and a retry
  // in flight shows the loading state.
  if (!query.isFetching && (spell === null || (query.isError && spell === undefined)))
    return <LoadError message="Failed to load spell." onRetry={() => query.refetch()} />;
  // Wait for both the spell load and session hydration before judging edit rights:
  // the spell's GET can resolve before `user`/`isAdmin` hydrate, and evaluating
  // canEdit then would falsely deny a legitimate owner/admin (VEG-320).
  if (authLoading || !spell) return <LoadingState />;

  const canEdit =
    (spell.contentSource === 'homebrew' && spell.createdById === user?.userId) ||
    (spell.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew spells.
        </p>
        <Link
          href="/srd/spells"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to spells
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Spell</h1>
      <SpellForm
        initial={spell}
        submitting={mutation.isPending || mutation.isSuccess}
        submitLabel="Save changes"
        onSubmit={payload => mutation.mutate(payload)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
