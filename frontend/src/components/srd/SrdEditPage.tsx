'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import { SRD_REGISTRY, type SrdEditable, type SrdKind } from '@/lib/srd-registry';

export default function SrdEditPage({ kind }: { kind: SrdKind }) {
  const entry = SRD_REGISTRY[kind];
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, user, isLoading: authLoading } = useAuth();
  const detailPath = `${entry.apiPath}/${id}`;

  const query = useApiQuery<SrdEditable | null>(detailPath, {
    errorToast: { message: `Failed to load ${kind}`, id: `load-${kind}` },
  });

  const mutation = useApiMutation(
    (payload: unknown) =>
      apiFetch(detailPath, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    {
      onSuccess: async () => {
        toast.success(`${entry.label} updated`);
        // The prefix also matches this page's own detail key, so navigating first
        // avoids waiting on a refetch that nothing renders.
        router.push(entry.listPath);
        await invalidateApiPath(queryClient, entry.apiPath);
      },
      onError: err => {
        console.error(`Failed to update ${kind}:`, err);
        toast.error(err instanceof Error ? err.message : `Failed to update ${kind}`);
      },
    }
  );

  const row = query.data;

  const backLink = (
    <Link
      href={entry.listPath}
      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
    >
      Back to {entry.plural}
    </Link>
  );

  // The API answers a row the caller can't see, or one that is gone, with an
  // empty body, which reads as null. A cached null that is being refetched
  // falls through to the loading view instead of flashing this.
  if (row === null && !query.isFetching)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">{entry.label} not found.</p>
        {backLink}
      </div>
    );

  // The failure view is only for a row that never loaded. A reload that fails
  // in the background, say after the network drops mid-edit, keeps the form and
  // its unsaved changes, and the error toast still reports the failure. A retry
  // in flight falls through to the loading view.
  if (query.isError && row === undefined && !query.isFetching)
    return <LoadError message={`Failed to load ${kind}.`} onRetry={() => query.refetch()} />;

  // Wait for auth to hydrate as well as the row. The GET can resolve before
  // `user` and `isAdmin` arrive, and judging edit rights then would turn away a
  // real owner or admin.
  if (authLoading || row == null) return <LoadingState />;

  const canEdit =
    (row.contentSource === 'homebrew' && row.createdById === user?.userId) ||
    (row.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew {entry.plural}.
        </p>
        {backLink}
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit {entry.label}</h1>
      {entry.renderForm({
        initial: row,
        submitting: mutation.isPending || mutation.isSuccess,
        submitLabel: 'Save changes',
        onSubmit: payload => mutation.mutate(payload),
        onCancel: () => router.back(),
      })}
    </div>
  );
}
