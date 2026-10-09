'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ClassForm from '@/components/ClassForm';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { ClassPayload } from '@/lib/class-form';
import { invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import type { SrdClass } from '@/lib/types';

export default function EditClassPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, user, isLoading: authLoading } = useAuth();

  const query = useApiQuery<SrdClass | null>(`/srd/classes/${id}`, {
    errorToast: { message: 'Failed to load class', id: 'load-class' },
  });

  const mutation = useApiMutation(
    (payload: ClassPayload) =>
      apiFetch<SrdClass>(`/srd/classes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    {
      onSuccess: async () => {
        toast.success('Class updated');
        // The prefix also matches this page's own detail key, so navigating first
        // avoids waiting on a refetch that nothing renders.
        router.push('/srd/classes');
        await invalidateApiPath(queryClient, '/srd/classes');
      },
      onError: err => {
        console.error('Failed to update class:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to update class');
      },
    }
  );

  const cls = query.data;

  // The API answers a class the caller can't see, or one that is gone, with an
  // empty body, which reads as null.
  if (cls === null)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">Class not found.</p>
        <Link
          href="/srd/classes"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to classes
        </Link>
      </div>
    );

  // The failure view is only for a class that never loaded. A reload that fails
  // in the background, say after the network drops mid-edit, keeps the form and
  // its unsaved changes, and the error toast still reports the failure. A retry
  // in flight falls through to the loading view.
  if (query.isError && cls === undefined && !query.isFetching)
    return <LoadError message="Failed to load class." onRetry={() => query.refetch()} />;

  // Wait for auth to hydrate as well as the class. The GET can resolve before
  // `user` and `isAdmin` arrive, and judging edit rights then would turn away a
  // real owner or admin.
  if (authLoading || cls === undefined) return <LoadingState />;

  const canEdit =
    (cls.contentSource === 'homebrew' && cls.createdById === user?.userId) ||
    (cls.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew classes.
        </p>
        <Link
          href="/srd/classes"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to classes
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Class</h1>
      <ClassForm
        initial={cls}
        submitting={mutation.isPending || mutation.isSuccess}
        submitLabel="Save changes"
        onSubmit={payload => mutation.mutate(payload)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
