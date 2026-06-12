'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import type { SrdFeat, PaginatedResponse } from '@/lib/types';
import Pagination from '@/components/Pagination';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import Badge from '@/components/Badge';
import FeatDetail from '@/components/FeatDetail';
import { FEAT_CATEGORIES } from '@/lib/feat-constants';

const LIMIT = 20;

/** "Category · Prerequisite" card metadata, falling back to a plain label. */
function featSubtitle(feat: SrdFeat): string {
  const parts = [feat.category, feat.prerequisite].filter(Boolean) as string[];
  return parts.length ? parts.join(' · ') : 'Feat';
}

export default function FeatListPage() {
  const { isAdmin, isAuthenticated, user } = useAuth();
  const [feats, setFeats] = useState<SrdFeat[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [prereqFilter, setPrereqFilter] = useState('');
  const [repeatableFilter, setRepeatableFilter] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<SrdFeat | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManageDetail =
    !!detail &&
    ((detail.contentSource === 'homebrew' && detail.createdById === user?.userId) ||
      (detail.contentSource === 'shared' && isAdmin));

  async function handleDeleteFeat() {
    if (!detail) return;
    try {
      await apiFetch(`/srd/feats/${detail.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${detail.name}`);
      setDetailOpen(false);
      // Refetch so the deleted feat drops out of the current page, clamping
      // in case the last row of the final page just went away.
      const lastPageAfterDelete = Math.max(1, Math.ceil((total - 1) / LIMIT));
      setPage(p => Math.min(p, lastPageAfterDelete));
      setRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete feat');
    }
  }

  function openFeat(id: string) {
    setDetail(null);
    setDetailLoading(true);
    setDetailOpen(true);
    apiFetch<SrdFeat | null>(`/srd/feats/${id}`)
      .then(feat => {
        // The endpoint resolves 200 null for ids outside the caller's
        // visibility (deleted, or someone else's homebrew) — without this
        // guard the modal sticks on "Loading feat…" forever.
        if (!feat) {
          toast.error('Feat not found', { id: 'load-feat' });
          setDetailOpen(false);
          return;
        }
        setDetail(feat);
      })
      .catch(err => {
        console.error('Failed to load feat:', err);
        toast.error('Failed to load feat', { id: 'load-feat' });
        setDetailOpen(false);
      })
      .finally(() => setDetailLoading(false));
  }

  // Filter changes reset to page 1 in the same commit as the filter itself so
  // the fetch effect fires exactly once. An effect-based reset would issue a
  // first fetch still on the old page, then a second one for page 1.
  const applyFilter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  // Debounce search input; the page reset rides along in the same commit.
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

  // Fetch feats from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (search) params.set('q', search);
    if (categoryFilter) params.set('category', categoryFilter);
    if (prereqFilter) params.set('hasPrerequisite', prereqFilter);
    if (repeatableFilter) params.set('repeatable', repeatableFilter);

    apiFetch<PaginatedResponse<SrdFeat>>(`/srd/feats?${params.toString()}`)
      .then(res => {
        setFeats(res.data);
        setTotal(res.total);
        setLastPage(res.lastPage);
        // Self-healing clamp (VEG-291 pattern): if a delete elsewhere shrank
        // the list, don't strand the user on an empty out-of-range page.
        if (res.data.length === 0 && page > Math.max(1, res.lastPage)) {
          setPage(Math.max(1, res.lastPage));
        }
      })
      .catch(err => {
        console.error('Failed to load feats:', err);
        toast.error('Failed to load feats', { id: 'load-feats' });
      })
      .finally(() => setLoading(false));
  }, [page, search, categoryFilter, prereqFilter, repeatableFilter, refreshKey]);

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Feats</h1>
        {isAuthenticated && (
          <Link
            href="/srd/feats/new"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            Create feat
          </Link>
        )}
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

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {loading ? 'Loading feats…' : `${total} feat${total !== 1 ? 's' : ''} found`}
      </p>

      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}
        aria-busy={loading}
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

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} label={detail?.name ?? 'Feat'}>
        {detailLoading || !detail ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading feat…</p>
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
