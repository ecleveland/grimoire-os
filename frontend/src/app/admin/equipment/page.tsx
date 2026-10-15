'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { invalidateApiPath, useApiMutation, useDeleteMutation, useListQuery } from '@/lib/query';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import AdminSubnav from '@/components/AdminSubnav';
import Pagination from '@/components/Pagination';
import ConfirmDialog from '@/components/ConfirmDialog';
import ItemForm from '@/components/ItemForm';
import BundleContentsEditor from '@/components/BundleContentsEditor';
import LoadingState from '@/components/LoadingState';
import LoadError from '@/components/LoadError';
import { ITEM_CATEGORIES } from '@/lib/item-constants';
import type { ItemPayload } from '@/lib/item-form';
import type { SrdItem, SrdItemBundleComponent } from '@/lib/types';

const LIMIT = 20;

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; item: SrdItem };

interface ContentsEditState {
  item: SrdItem;
  contents: SrdItemBundleComponent[];
}

const controlClass =
  'px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

export default function AdminEquipmentPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const q = useDebouncedValue(searchInput.trim());

  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [pendingDelete, setPendingDelete] = useState<SrdItem | null>(null);
  const [contentsEdit, setContentsEdit] = useState<ContentsEditState | null>(null);

  // A committed search resets to page 1 in the same render (React's
  // adjust-state-while-rendering pattern), so the list fetches once, with
  // page=1 and the new query, instead of first refetching the old page.
  const [prevSearch, setPrevSearch] = useState(q);
  if (q !== prevSearch) {
    setPrevSearch(q);
    setPage(1);
  }

  // The redirect waits for session hydration, because the pre-hydration
  // `isAdmin: false` would bounce a real admin on refresh.
  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) router.replace('/');
  }, [authLoading, isAdmin, router]);

  const list = useListQuery<SrdItem>(
    '/admin/items',
    { page, limit: LIMIT, category, q },
    { enabled: !authLoading && isAdmin, errorToast: 'Failed to load items' }
  );
  const items = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const lastPage = list.data?.lastPage ?? 1;

  const create = useApiMutation(
    (payload: ItemPayload) =>
      apiFetch('/admin/items', { method: 'POST', body: JSON.stringify(payload) }),
    {
      onSuccess: async () => {
        toast.success('Item created');
        await invalidateApiPath(queryClient, '/admin/items?');
        setMode({ kind: 'list' });
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to create item');
      },
    }
  );

  const update = useApiMutation(
    ({ id, payload }: { id: string; payload: ItemPayload }) =>
      apiFetch(`/admin/items/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    {
      onSuccess: async () => {
        toast.success('Item updated');
        await invalidateApiPath(queryClient, '/admin/items?');
        setMode({ kind: 'list' });
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to update item');
      },
    }
  );

  const submitting = create.isPending || update.isPending;

  const remove = useDeleteMutation({
    path: '/admin/items',
    invalidate: '/admin/items?',
    onDeleted: () => {
      toast.success('Item deleted');
      // The invalidation refetches the authoritative total and lastPage. If
      // the deleted row was the last one on a later page, step back so the
      // admin does not land on a stranded empty page.
      if (items.length === 1 && page > 1) setPage(p => p - 1);
    },
  });

  const confirmDelete = () => {
    if (!pendingDelete) return;
    remove.mutate(pendingDelete.id, {
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to delete item');
      },
    });
  };

  // The detail endpoint resolves bundle contents; the list response omits them.
  const loadContents = useApiMutation(
    (item: SrdItem) => apiFetch<SrdItem | null>(`/srd/items/${item.id}`),
    {
      onSuccess: (detail, item) => {
        if (!detail) {
          toast.error('That item no longer exists');
          return;
        }
        setContentsEdit({ item, contents: detail.contents ?? [] });
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to load pack contents');
      },
    }
  );

  const saveContents = useApiMutation(
    (edit: ContentsEditState) =>
      apiFetch(`/admin/items/${edit.item.id}/contents`, {
        method: 'PUT',
        body: JSON.stringify({
          contents: edit.contents.map(c => ({ itemId: c.itemId, quantity: c.quantity })),
        }),
      }),
    {
      onSuccess: (_data, edit) => {
        toast.success('Pack contents saved');
        void invalidateApiPath(queryClient, `/srd/items/${edit.item.id}`);
        setContentsEdit(null);
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to save pack contents');
      },
    }
  );

  if (!isAdmin) return null;

  if (mode.kind !== 'list') {
    const editing = mode.kind === 'edit' ? mode.item : undefined;
    return (
      <div>
        <AdminSubnav />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          {editing ? `Edit ${editing.name}` : 'New item'}
        </h1>
        <div className="max-w-3xl bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <ItemForm
            initial={editing}
            submitting={submitting}
            submitLabel={editing ? 'Save changes' : 'Create item'}
            onSubmit={payload =>
              editing ? update.mutate({ id: editing.id, payload }) : create.mutate(payload)
            }
            onCancel={() => setMode({ kind: 'list' })}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <AdminSubnav />
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Equipment &amp; Items</h1>
        <button
          onClick={() => setMode({ kind: 'create' })}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
        >
          New item
        </button>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Admin-published catalog items (equipment packs and the edge categories). These are shared
        with everyone and survive a re-seed; the seeded SRD items remain read-only.
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <select
          aria-label="Filter by category"
          value={category}
          onChange={e => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className={controlClass}
        >
          <option value="">All categories</option>
          {ITEM_CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search items"
          placeholder="Search by name…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className={`${controlClass} flex-1 min-w-[12rem]`}
        />
      </div>

      {/* A Retry after a failed load keeps status 'error' while it runs, so the
          loading view checks isFetching as well as isPending. */}
      {list.isPending || (list.isError && list.isFetching && !list.data) ? (
        <LoadingState label="Loading items..." />
      ) : list.isError && !list.data ? (
        <LoadError message="Failed to load items" onRetry={list.refetch} />
      ) : items.length === 0 ? (
        <div className="text-gray-500 dark:text-gray-400">
          No shared items yet. Use “New item” to add an equipment pack or edge-category item.
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Name</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                    Category
                  </th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">Cost</th>
                  <th className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {items.map(item => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{item.category}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {item.cost || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => setMode({ kind: 'edit', item })}
                          className="text-sm text-indigo-600 hover:text-indigo-700"
                        >
                          Edit
                        </button>
                        {item.category === 'Equipment Pack' && (
                          <button
                            onClick={() => loadContents.mutate(item)}
                            className="text-sm text-indigo-600 hover:text-indigo-700"
                          >
                            Contents
                          </button>
                        )}
                        <button
                          onClick={() => setPendingDelete(item)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination
        page={page}
        lastPage={lastPage}
        total={total}
        limit={LIMIT}
        onPageChange={setPage}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={open => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete item?"
        description={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? This removes the shared catalog item${
                pendingDelete.category === 'Equipment Pack' ? ' and its pack contents' : ''
              }. This cannot be undone.`
            : ''
        }
        variant="danger"
        onConfirm={confirmDelete}
      />

      {contentsEdit && (
        <div
          role="dialog"
          aria-label={`Edit contents of ${contentsEdit.item.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              {contentsEdit.item.name} — contents
            </h2>
            <BundleContentsEditor
              value={contentsEdit.contents}
              selfId={contentsEdit.item.id}
              onChange={contents => setContentsEdit(prev => (prev ? { ...prev, contents } : prev))}
            />
            <div className="flex gap-3 pt-6">
              <button
                onClick={() => saveContents.mutate(contentsEdit)}
                disabled={saveContents.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
              >
                {saveContents.isPending ? 'Saving...' : 'Save contents'}
              </button>
              <button
                onClick={() => setContentsEdit(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
