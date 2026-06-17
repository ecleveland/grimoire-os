'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import AdminSubnav from '@/components/AdminSubnav';
import Pagination from '@/components/Pagination';
import ConfirmDialog from '@/components/ConfirmDialog';
import ItemForm from '@/components/ItemForm';
import BundleContentsEditor from '@/components/BundleContentsEditor';
import { ITEM_CATEGORIES } from '@/lib/item-constants';
import type { ItemPayload } from '@/lib/item-form';
import type { PaginatedResponse, SrdItem, SrdItemBundleComponent } from '@/lib/types';

const LIMIT = 20;

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; item: SrdItem };

interface ContentsEditState {
  item: SrdItem;
  contents: SrdItemBundleComponent[];
  saving: boolean;
}

const controlClass =
  'px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

export default function AdminEquipmentPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<SrdItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');

  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [submitting, setSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SrdItem | null>(null);
  const [contentsEdit, setContentsEdit] = useState<ContentsEditState | null>(null);

  // Debounce the search box into the query that drives the fetch.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadSeq = useRef(0);
  useEffect(() => {
    // Wait for session hydration before judging admin status — acting on the
    // pre-hydration `isAdmin:false` would bounce a real admin on refresh.
    if (authLoading) return;
    if (!isAdmin) {
      router.replace('/');
      return;
    }
    const seq = ++loadSeq.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (category) params.set('category', category);
    if (query) params.set('q', query);
    apiFetch<PaginatedResponse<SrdItem>>(`/admin/items?${params.toString()}`)
      .then(res => {
        if (seq !== loadSeq.current) return;
        setItems(res.data);
        setTotal(res.total);
        setLastPage(res.lastPage);
      })
      .catch(() => {
        if (seq === loadSeq.current) toast.error('Failed to load items');
      })
      .finally(() => {
        if (seq === loadSeq.current) setLoading(false);
      });
  }, [authLoading, isAdmin, router, page, category, query, reloadKey]);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  const handleCreate = async (payload: ItemPayload) => {
    setSubmitting(true);
    try {
      await apiFetch('/admin/items', { method: 'POST', body: JSON.stringify(payload) });
      toast.success('Item created');
      setMode({ kind: 'list' });
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create item');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (id: string, payload: ItemPayload) => {
    setSubmitting(true);
    try {
      await apiFetch(`/admin/items/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      toast.success('Item updated');
      setMode({ kind: 'list' });
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update item');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await apiFetch(`/admin/items/${pendingDelete.id}`, { method: 'DELETE' });
      setItems(prev => prev.filter(i => i.id !== pendingDelete.id));
      setTotal(prev => prev - 1);
      toast.success('Item deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete item');
    }
  };

  const openContents = async (item: SrdItem) => {
    try {
      // The detail endpoint resolves bundle contents; the list response omits them.
      const detail = await apiFetch<SrdItem>(`/srd/items/${item.id}`);
      setContentsEdit({ item, contents: detail.contents ?? [], saving: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load pack contents');
    }
  };

  const saveContents = async () => {
    if (!contentsEdit) return;
    setContentsEdit({ ...contentsEdit, saving: true });
    try {
      await apiFetch(`/admin/items/${contentsEdit.item.id}/contents`, {
        method: 'PUT',
        body: JSON.stringify({
          contents: contentsEdit.contents.map(c => ({ itemId: c.itemId, quantity: c.quantity })),
        }),
      });
      toast.success('Pack contents saved');
      setContentsEdit(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save pack contents');
      setContentsEdit(prev => (prev ? { ...prev, saving: false } : prev));
    }
  };

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
              editing ? handleUpdate(editing.id, payload) : handleCreate(payload)
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

      {loading && items.length === 0 ? (
        <div className="text-gray-500 dark:text-gray-400">Loading items...</div>
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
                            onClick={() => openContents(item)}
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
                onClick={saveContents}
                disabled={contentsEdit.saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm"
              >
                {contentsEdit.saving ? 'Saving...' : 'Save contents'}
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
