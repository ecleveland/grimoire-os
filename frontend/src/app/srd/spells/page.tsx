'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { useApiQuery, useDeleteMutation, useListQuery } from '@/lib/query';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import CreateEntityLink from '@/components/CreateEntityLink';
import type { SrdSpell } from '@/lib/types';
import Pagination from '@/components/Pagination';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import Badge from '@/components/Badge';
import SpellDetail from '@/components/SpellDetail';
import PrintToggle from '@/components/PrintToggle';
import LoadingState from '@/components/LoadingState';
import LoadError from '@/components/LoadError';
import { SRD_CLASSES, SPELL_SCHOOLS, SPELL_LEVELS, levelLabel } from '@/lib/spell-constants';

const LIMIT = 20;

export default function SpellListPage() {
  const { isAdmin, user } = useAuth();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebouncedValue(searchInput);
  const [levelFilter, setLevelFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
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

  const list = useListQuery<SrdSpell>(
    '/srd/spells',
    {
      page,
      limit: LIMIT,
      q: search,
      level: levelFilter,
      school: schoolFilter,
      class: classFilter,
    },
    { errorToast: { message: 'Failed to load spells', id: 'load-spells' } }
  );
  const spells = list.data?.data ?? [];
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

  const detailQuery = useApiQuery<SrdSpell | null>(`/srd/spells/${detailId}`, {
    enabled: detailId !== null,
    errorToast: { message: 'Failed to load spell', id: 'load-spell' },
  });
  const detail = detailQuery.data ?? null;
  // The endpoint resolves 200 null for ids outside the caller's visibility
  // (deleted, or someone else's homebrew); without this guard the modal
  // would stick on "Loading spell…" forever.
  const detailMissing = detailQuery.isError || (detailQuery.isSuccess && detail === null);
  const detailOpen = detailId !== null && !detailMissing;
  const { isSuccess: detailLoaded, dataUpdatedAt: detailUpdatedAt } = detailQuery;
  useEffect(() => {
    if (detailId !== null && detailLoaded && detail === null) {
      toast.error('Spell not found', { id: 'load-spell' });
    }
  }, [detailId, detailLoaded, detail, detailUpdatedAt]);

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManageDetail =
    !!detail &&
    ((detail.contentSource === 'homebrew' && detail.createdById === user?.userId) ||
      (detail.contentSource === 'shared' && isAdmin));

  const deleteSpell = useDeleteMutation({
    path: '/srd/spells',
    invalidate: '/srd/spells?',
    onDeleted: id => {
      // Close only the deleted spell's modal; another opened while the DELETE
      // was in flight stays open.
      setDetailId(current => (current === id ? null : current));
      // Clamp in case the last row of the final page just went away.
      const lastPageAfterDelete = Math.max(1, Math.ceil((total - 1) / LIMIT));
      setPage(p => Math.min(p, lastPageAfterDelete));
    },
  });

  function handleDeleteSpell() {
    if (!detail) return;
    // Captured now: by the time the DELETE resolves, `detail` may be another spell.
    const { id, name } = detail;
    deleteSpell.mutate(id, {
      onSuccess: () => toast.success(`Deleted ${name}`),
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to delete spell');
      },
    });
  }

  function openSpell(id: string) {
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
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Spells</h1>
        <CreateEntityLink href="/srd/spells/new" label="Create spell" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search spells..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className={inputClass}
        />
        <select
          aria-label="Level"
          value={levelFilter}
          onChange={e => applyFilter(setLevelFilter)(e.target.value)}
          className={inputClass}
        >
          <option value="">All Levels</option>
          {SPELL_LEVELS.map(l => (
            <option key={l} value={l}>
              {levelLabel(l)}
            </option>
          ))}
        </select>
        <select
          aria-label="School"
          value={schoolFilter}
          onChange={e => applyFilter(setSchoolFilter)(e.target.value)}
          className={inputClass}
        >
          <option value="">All Schools</option>
          {SPELL_SCHOOLS.map(s => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="Class"
          value={classFilter}
          onChange={e => applyFilter(setClassFilter)(e.target.value)}
          className={inputClass}
        >
          <option value="">All Classes</option>
          {SRD_CLASSES.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* A Retry after a failed background refetch keeps status 'error' while it
          runs, so isFetching (not just isPending) shows the loading line. */}
      {list.isPending || (list.isError && list.isFetching) ? (
        <LoadingState label="Loading spells…" className="text-sm mb-4" />
      ) : list.isError ? (
        <LoadError message="Failed to load spells" onRetry={list.refetch} className="mb-4" />
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {`${total} spell${total !== 1 ? 's' : ''} found`}
        </p>
      )}

      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${list.isFetching ? 'opacity-60' : ''}`}
        aria-busy={list.isFetching}
      >
        {spells.map(s => (
          <div key={s.id} className="relative">
            <button
              type="button"
              data-testid="spell-card"
              onClick={() => openSpell(s.id)}
              className="w-full h-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            >
              <h3 className="font-semibold text-gray-900 dark:text-white pr-8">
                {s.name}
                {s.contentSource === 'homebrew' && (
                  <Badge variant="homebrew" className="ml-2 inline-block align-middle">
                    Homebrew
                  </Badge>
                )}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {levelLabel(s.level)} &middot; {s.school} &middot; {s.castingTime}
              </p>
            </button>
            <PrintToggle type="spell" id={s.id} name={s.name} className="absolute top-3 right-3" />
          </div>
        ))}
      </div>

      <Modal open={detailOpen} onClose={() => setDetailId(null)} label={detail?.name ?? 'Spell'}>
        {detailQuery.isPending || !detail ? (
          <LoadingState label="Loading spell…" className="py-8 text-center text-sm" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {detail.name}
                  {detail.concentration && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                      Concentration
                    </span>
                  )}
                  {detail.ritual && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                      Ritual
                    </span>
                  )}
                  {detail.contentSource === 'homebrew' && (
                    <Badge variant="homebrew" className="ml-2 inline-block align-middle">
                      Homebrew
                    </Badge>
                  )}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {levelLabel(detail.level)} &middot; {detail.school}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canManageDetail && (
                  <>
                    <Link
                      href={`/srd/spells/${detail.id}/edit`}
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
                  </>
                )}
                <PrintToggle type="spell" id={detail.id} name={detail.name} variant="button" />
              </div>
            </div>

            <SpellDetail spell={detail} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete spell?"
        description={`"${detail?.name ?? 'This spell'}" will be permanently deleted. This cannot be undone.`}
        confirmLabel="Delete spell"
        variant="danger"
        onConfirm={handleDeleteSpell}
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
