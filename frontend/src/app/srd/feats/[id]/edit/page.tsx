'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import FeatForm from '@/components/FeatForm';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { FeatPayload } from '@/lib/feat-form';
import { invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import type { SrdFeat } from '@/lib/types';

export default function EditFeatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, user, isLoading: authLoading } = useAuth();

  const query = useApiQuery<SrdFeat | null>(`/srd/feats/${id}`, {
    errorToast: 'Failed to load feat',
  });

  const mutation = useApiMutation(
    (payload: FeatPayload) =>
      apiFetch<SrdFeat>(`/srd/feats/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    {
      onSuccess: () => {
        toast.success('Feat updated');
        // The prefix also matches this page's own detail key, so the refetch is
        // left to run in the background rather than holding up the navigation.
        void invalidateApiPath(queryClient, '/srd/feats');
        router.push('/srd/feats');
      },
      onError: err => {
        console.error('Failed to update feat:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to update feat');
      },
    }
  );

  const feat = query.data;

  // The detail endpoint returns null for ids outside the caller's visibility
  // (missing, or someone else's homebrew), so treat that as a failed load rather
  // than rendering an empty editable form (VEG-317). A background reload that
  // fails after the feat loaded keeps the form and its unsaved changes, and a retry
  // in flight shows the loading state.
  if (!query.isFetching && (feat === null || (query.isError && feat === undefined)))
    return <LoadError message="Failed to load feat." onRetry={() => query.refetch()} />;
  // Wait for both the feat load and session hydration before judging edit rights:
  // the feat's GET can resolve before `user`/`isAdmin` hydrate, and evaluating
  // canEdit then would falsely deny a legitimate owner/admin (VEG-320).
  if (authLoading || !feat) return <LoadingState />;

  const canEdit =
    (feat.contentSource === 'homebrew' && feat.createdById === user?.userId) ||
    (feat.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew feats.
        </p>
        <Link
          href="/srd/feats"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to feats
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Feat</h1>
      <FeatForm
        initial={feat}
        submitting={mutation.isPending || mutation.isSuccess}
        submitLabel="Save changes"
        onSubmit={payload => mutation.mutate(payload)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
