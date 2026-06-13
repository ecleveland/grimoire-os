'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import CreateEntityLink from '@/components/CreateEntityLink';
import type { SrdItem, PaginatedResponse } from '@/lib/types';
import Pagination from '@/components/Pagination';
import Markdown from '@/components/Markdown';
import PrintToggle from '@/components/PrintToggle';
import Badge from '@/components/Badge';
import ConfirmDialog from '@/components/ConfirmDialog';
import { ITEM_CATEGORIES } from '@/lib/item-constants';

const LIMIT = 20;

export default function ItemListPage() {
  const { isAdmin, user } = useAuth();
  const [items, setItems] = useState<SrdItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [pendingDelete, setPendingDelete] = useState<SrdItem | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManage = (item: SrdItem) =>
    (item.contentSource === 'homebrew' && item.createdById === user?.userId) ||
    (item.contentSource === 'shared' && isAdmin);

  async function handleDeleteItem() {
    if (!pendingDelete) return;
    try {
      await apiFetch(`/srd/items/${pendingDelete.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${pendingDelete.name}`);
      // Refetch so the deleted item drops out of the current page, clamping
      // in case the last row of the final page just went away.
      const lastPageAfterDelete = Math.max(1, Math.ceil((total - 1) / LIMIT));
      setPage(p => Math.min(p, lastPageAfterDelete));
      setRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete item');
    } finally {
      setPendingDelete(null);
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (search) params.set('q', search);
    if (categoryFilter) params.set('category', categoryFilter);

    apiFetch<PaginatedResponse<SrdItem>>(`/srd/items?${params.toString()}`)
      .then(res => {
        setItems(res.data);
        setTotal(res.total);
        setLastPage(res.lastPage);
        // Self-healing clamp (VEG-291 pattern): if a delete elsewhere shrank
        // the list, don't strand the user on an empty out-of-range page.
        if (res.data.length === 0 && page > Math.max(1, res.lastPage)) {
          setPage(Math.max(1, res.lastPage));
        }
      })
      .catch(err => {
        console.error('Failed to load items:', err);
        toast.error('Failed to load items', { id: 'load-items' });
      })
      .finally(() => setLoading(false));
  }, [page, search, categoryFilter, refreshKey]);

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setPage(1);
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Items</h1>
        <CreateEntityLink href="/srd/items/new" label="Create item" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search items..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className={inputClass}
        />
        <select
          value={categoryFilter}
          onChange={e => handleCategoryChange(e.target.value)}
          className={inputClass}
        >
          <option value="">All Categories</option>
          {ITEM_CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {loading ? 'Loading items…' : `${total} item${total !== 1 ? 's' : ''} found`}
      </p>

      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}
        aria-busy={loading}
      >
        {items.map(item => (
          <ItemCard
            key={item.id}
            item={item}
            canManage={canManage(item)}
            onDelete={() => {
              setPendingDelete(item);
              setConfirmDeleteOpen(true);
            }}
          />
        ))}
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete item?"
        description={`"${pendingDelete?.name ?? 'This item'}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete item"
        variant="danger"
        onConfirm={handleDeleteItem}
      />

      <Pagination
        page={page}
        lastPage={lastPage}
        total={total}
        limit={LIMIT}
        onPageChange={setPage}
      />
    </div>
  );
}

function ItemCard({
  item,
  canManage,
  onDelete,
}: {
  item: SrdItem;
  canManage: boolean;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(item.description?.trim());

  return (
    <div
      data-testid="item-card"
      className="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {item.name}
          {item.contentSource === 'homebrew' && (
            <Badge variant="homebrew" className="ml-2 inline-block align-middle">
              Homebrew
            </Badge>
          )}
        </h3>
        <PrintToggle type="item" id={item.id} name={item.name} className="shrink-0 -mt-0.5" />
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{item.category}</p>
      {(item.rarity || item.requiresAttunement) && (
        <div className="flex flex-wrap gap-1 mt-2 text-xs">
          {item.rarity && (
            <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded">
              {item.rarity}
            </span>
          )}
          {item.requiresAttunement && (
            <span className="px-1.5 py-0.5 bg-amber-50 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded">
              Requires Attunement
            </span>
          )}
        </div>
      )}
      <div className="flex gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
        {item.cost && <span>Cost: {item.cost}</span>}
        {item.weight != null && <span>Weight: {item.weight}</span>}
      </div>
      {item.damage && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Damage: {item.damage}</p>
      )}
      {item.properties.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {item.properties.map(p => (
            <span
              key={p}
              className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
            >
              {p}
            </span>
          ))}
        </div>
      )}
      {hasDetails && (
        <>
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            aria-expanded={expanded}
            className="mt-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded && (
            <div className="mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">
              <Markdown>{item.description!}</Markdown>
            </div>
          )}
        </>
      )}
      {canManage && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <Link
            href={`/srd/items/${item.id}/edit`}
            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={onDelete}
            className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
