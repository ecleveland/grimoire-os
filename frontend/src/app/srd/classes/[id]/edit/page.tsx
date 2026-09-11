'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ClassForm from '@/components/ClassForm';
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
        // The prefix covers this class's detail key as well as the list pages.
        await invalidateApiPath(queryClient, '/srd/classes');
        router.push('/srd/classes');
      },
      onError: err => {
        console.error('Failed to update class:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to update class');
      },
    }
  );

  const cls = query.data;

  // A class the caller can't see comes back as a 200 with an empty body, which
  // apiFetch fails to parse, so a hidden or deleted class arrives as a query
  // error. A null body gets the same treatment. The failure view only stands in
  // for a class that never loaded: a reload that fails in the background, say
  // after the network drops mid-edit, keeps the form and its unsaved changes,
  // and the error toast still reports the failure.
  if (cls === null || (query.isError && cls === undefined))
    return (
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
    );

  // Wait for auth to hydrate as well as the class. The GET can resolve before
  // `user` and `isAdmin` arrive, and judging edit rights then would turn away a
  // real owner or admin.
  if (authLoading || cls === undefined)
    return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;

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
        submitting={mutation.isPending}
        submitLabel="Save changes"
        onSubmit={payload => mutation.mutate(payload)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
