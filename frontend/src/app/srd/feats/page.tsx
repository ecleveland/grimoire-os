'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useApiQuery, useDeleteMutation, useListQuery } from '@/lib/query';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import CreateEntityLink from '@/components/CreateEntityLink';
import type { SrdFeat } from '@/lib/types';
import Pagination from '@/components/Pagination';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import Badge from '@/components/Badge';
import FeatDetail from '@/components/FeatDetail';
import LoadingState from '@/components/LoadingState';
import LoadError from '@/components/LoadError';
import { FEAT_CATEGORIES } from '@/lib/feat-constants';

const LIMIT = 20;

/** "Category · Prerequisite" card metadata, falling back to a plain label. */
function featSubtitle(feat: SrdFeat): string {
  const parts = [feat.category, feat.prerequisite].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : 'Feat';
}

export default function FeatListPage() {
  const { isAdmin, user } = useAuth();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [prereqFilter, setPrereqFilter] = useState('');
  const [repeatableFilter, setRepeatableFilter] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // A committed search resets to page 1 in the same render (React's
  // adjust-state-while-rendering pattern), so the list fetches once, with
  // page=1 and the new query, instead of first refetching the old page.
  const [prevSearch, setPrevSearch] = useState(search);
  if (search !== prevSearch) {
    setPrevSearch(search);
    setPage(1);
  }

  const list = useListQuery<SrdFeat>(
    '/srd/feats',
    {
      page,
      limit: LIMIT,
      q: search,
      category: categoryFilter,
      hasPrerequisite: prereqFilter,
      repeatable: repeatableFilter,
    },
    { errorToast: { message: 'Failed to load feats', id: 'load-feats' } }
  );
  const feats = list.data?.data ?? [];
  const total = list.data?.total ?? 0;
  const lastPage = list.data?.lastPage ?? 1;

  // Self-healing clamp (VEG-291 pattern): if a delete elsewhere shrank the
  // list, don't strand the user on an empty out-of-range page.
  if (
    list.data &&
    !list.isPlaceholderData &&
    list.data.data.length === 0 &&
    page > Math.max(1, list.data.lastPage)
  ) {
    setPage(Math.max(1, list.data.lastPage));
  }

  const detailQuery = useApiQuery<SrdFeat | null>(`/srd/feats/${detailId}`, {
    enabled: detailId !== null,
    errorToast: { message: 'Failed to load feat', id: 'load-feat' },
  });
  const detail = detailQuery.data ?? null;
  // The endpoint resolves 200 null for ids outside the caller's visibility
  // (deleted, or someone else's homebrew); without this guard the modal
  // would stick on "Loading feat…" forever.
  const detailMissing = detailQuery.isError || (detailQuery.isSuccess && detail === null);
  const detailOpen = detailId !== null && !detailMissing;
  const { isSuccess: detailLoaded, dataUpdatedAt: detailUpdatedAt } = detailQuery;
  useEffect(() => {
    if (detailId !== null && detailLoaded && detail === null) {
      toast.error('Feat not found', { id: 'load-feat' });
    }
  }, [detailId, detailLoaded, detail, detailUpdatedAt]);

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManageDetail =
    !!detail &&
    ((detail.contentSource === 'homebrew' && detail.createdById === user?.userId) ||
      (detail.contentSource === 'shared' && isAdmin));

  const deleteFeat = useDeleteMutation({
    path: '/srd/feats',
    invalidate: '/srd/feats?',
    onDeleted: id => {
      // Close only the deleted feat's modal; another opened while the DELETE
      // was in flight stays open.
      setDetailId(current => (current === id ? null : current));
      // Clamp in case the last row of the final page just went away.
      const lastPageAfterDelete = Math.max(1, Math.ceil((total - 1) / LIMIT));
      setPage(p => Math.min(p, lastPageAfterDelete));
    },
  });

  function handleDeleteFeat() {
    if (!detail) return;
    // Captured now: by the time the DELETE resolves, `detail` may be another feat.
    const { id, name } = detail;
    deleteFeat.mutate(id, {
      onSuccess: () => toast.success(`Deleted ${name}`),
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to delete feat');
      },
    });
  }

  function openFeat(id: string) {
    // Re-opening the card whose last load came back missing refetches it, so
    // the click isn't silently swallowed by an unchanged id.
    if (id === detailId) void detailQuery.refetch();
    else setDetailId(id);
  }

  // Filter changes reset to page 1 in the same commit as the filter itself so
  // the list fetches exactly once. An effect-based reset would issue a first
  // fetch still on the old page, then a second one for page 1.
  const applyFilter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Feats</h1>
        <CreateEntityLink href="/srd/feats/new" label="Create feat" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search feats..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className={inputClass}
        />
        <select
          aria-label="Category"
          value={categoryFilter}
          onChange={e => applyFilter(setCategoryFilter)(e.target.value)}
          className={inputClass}
        >
          <option value="">All Categories</option>
          {FEAT_CATEGORIES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Prerequisite"
          value={prereqFilter}
          onChange={e => applyFilter(setPrereqFilter)(e.target.value)}
          className={inputClass}
        >
          <option value="">Any Prerequisite</option>
          <option value="true">Has prerequisite</option>
          <option value="false">No prerequisite</option>
        </select>
        <select
          aria-label="Repeatable"
          value={repeatableFilter}
          onChange={e => applyFilter(setRepeatableFilter)(e.target.value)}
          className={inputClass}
        >
          <option value="">Any</option>
          <option value="true">Repeatable</option>
          <option value="false">Single-use</option>
        </select>
      </div>

      {/* A Retry after a failed background refetch keeps status 'error' while it
          runs, so isFetching (not just isPending) shows the loading line. */}
      {list.isPending || (list.isError && list.isFetching) ? (
        <LoadingState label="Loading feats…" className="text-sm mb-4" />
      ) : list.isError ? (
        <LoadError message="Failed to load feats" onRetry={list.refetch} className="mb-4" />
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {`${total} feat${total !== 1 ? 's' : ''} found`}
        </p>
      )}

      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${list.isFetching ? 'opacity-60' : ''}`}
        aria-busy={list.isFetching}
      >
        {feats.map(f => (
          <button
            key={f.id}
            type="button"
            data-testid="feat-card"
            onClick={() => openFeat(f.id)}
            className="w-full h-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
          >
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {f.name}
              {f.contentSource === 'homebrew' && (
                <Badge variant="homebrew" className="ml-2 inline-block align-middle">
                  Homebrew
                </Badge>
              )}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{featSubtitle(f)}</p>
          </button>
        ))}
      </div>

      <Modal open={detailOpen} onClose={() => setDetailId(null)} label={detail?.name ?? 'Feat'}>
        {detailQuery.isPending || !detail ? (
          <LoadingState label="Loading feat…" className="py-8 text-center text-sm" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {detail.name}
                  {detail.repeatable && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                      Repeatable
                    </span>
                  )}
                  {detail.contentSource === 'homebrew' && (
                    <Badge variant="homebrew" className="ml-2 inline-block align-middle">
                      Homebrew
                    </Badge>
                  )}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {featSubtitle(detail)}
                </p>
              </div>
              {canManageDetail && (
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/srd/feats/${detail.id}/edit`}
                    className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteOpen(true)}
                    className="px-3 py-1.5 text-sm text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            <FeatDetail feat={detail} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete feat?"
        description={`"${detail?.name ?? 'This feat'}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete feat"
        variant="danger"
        onConfirm={handleDeleteFeat}
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
