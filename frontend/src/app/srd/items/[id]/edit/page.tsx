'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import ItemForm from '@/components/ItemForm';
import LoadError from '@/components/LoadError';
import LoadingState from '@/components/LoadingState';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { ItemPayload } from '@/lib/item-form';
import { invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import type { SrdItem } from '@/lib/types';

export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAdmin, user, isLoading: authLoading } = useAuth();

  const query = useApiQuery<SrdItem | null>(`/srd/items/${id}`, {
    errorToast: 'Failed to load item',
  });

  const mutation = useApiMutation(
    (payload: ItemPayload) =>
      apiFetch<SrdItem>(`/srd/items/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    {
      onSuccess: () => {
        toast.success('Item updated');
        // The prefix also matches this page's own detail key, so the refetch is
        // left to run in the background rather than holding up the navigation.
        void invalidateApiPath(queryClient, '/srd/items');
        router.push('/srd/items');
      },
      onError: err => {
        console.error('Failed to update item:', err);
        toast.error(err instanceof Error ? err.message : 'Failed to update item');
      },
    }
  );

  const item = query.data;

  // The detail endpoint returns null for ids outside the caller's visibility
  // (missing, or someone else's homebrew), so treat that as a failed load rather
  // than rendering an empty editable form (VEG-317). A background reload that
  // fails after the item loaded keeps the form and its unsaved changes, and a retry
  // in flight shows the loading state.
  if (!query.isFetching && (item === null || (query.isError && item === undefined)))
    return <LoadError message="Failed to load item." onRetry={() => query.refetch()} />;
  // Wait for both the item load and session hydration before judging edit rights:
  // the item's GET can resolve before `user`/`isAdmin` hydrate, and evaluating
  // canEdit then would falsely deny a legitimate owner/admin (VEG-320).
  if (authLoading || !item) return <LoadingState />;

  const canEdit =
    (item.contentSource === 'homebrew' && item.createdById === user?.userId) ||
    (item.contentSource === 'shared' && isAdmin);

  if (!canEdit)
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You can only edit your own homebrew items.
        </p>
        <Link
          href="/srd/items"
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Back to items
        </Link>
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Edit Item</h1>
      <ItemForm
        initial={item}
        submitting={mutation.isPending || mutation.isSuccess}
        submitLabel="Save changes"
        onSubmit={payload => mutation.mutate(payload)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
