'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import BackgroundForm from '@/components/BackgroundForm';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { BackgroundPayload } from '@/lib/background-form';
import { invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import type { SrdBackground } from '@/lib/types';

export default function EditBackgroundPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, user, isLoading: authLoading } = useAuth();

  const query = useApiQuery<SrdBackground | null>(`/srd/backgrounds/${id}`, {
    errorToast: 'Failed to load background',
  });

  const mutation = useApiMutation(
    (payload: BackgroundPayload) =>
      apiFetch<SrdBackground>(`/srd/backgrounds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    {
      onSuccess: () => {
        toast.success('Background updated');
        // The prefix also matches this page's own detail key, so the refetch is
        // left to run in the background rather than holding up the navigation.
        void invalidateApiPath(queryClient, '/srd/backgrounds');
        router.push('/srd/backgrounds');
      },
      onError: err => {
        console.error('Failed to update background:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to update background');
      },
    }
  );

  const background = query.data;

  // The detail endpoint returns null for ids outside the caller's visibility
  // (missing, or someone else's homebrew), so treat that as a failed load rather
  // than rendering an empty editable form (VEG-317). A background reload that
  // fails after the background loaded keeps the form and its unsaved changes, and a retry
  // in flight shows the loading state.
  if (!query.isFetching && (background === null || (query.isError && background === undefined)))
    return <LoadError message="Failed to load background." onRetry={() => query.refetch()} />;
  // Wait for both the background load and session hydration before judging edit rights:
  // the background's GET can resolve before `user`/`isAdmin` hydrate, and evaluating
  // canEdit then would falsely deny a legitimate owner/admin (VEG-320).
  if (authLoading || !background) return <LoadingState />;

  const canEdit =
    (background.contentSource === 'homebrew' && background.createdById === user?.userId) ||
    (background.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew backgrounds.
        </p>
        <Link
          href="/srd/backgrounds"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to backgrounds
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Background</h1>
      <BackgroundForm
        initial={background}
        submitting={mutation.isPending || mutation.isSuccess}
        submitLabel="Save changes"
        onSubmit={payload => mutation.mutate(payload)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
