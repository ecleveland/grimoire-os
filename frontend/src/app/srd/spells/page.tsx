'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import type { SrdSpell, PaginatedResponse } from '@/lib/types';
import Pagination from '@/components/Pagination';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import Markdown from '@/components/Markdown';
import PrintToggle from '@/components/PrintToggle';
import { SRD_CLASSES, SPELL_SCHOOLS, SPELL_LEVELS } from '@/lib/spell-constants';

const LIMIT = 20;

function levelLabel(level: number): string {
  return level === 0 ? 'Cantrip' : `Level ${level}`;
}

export default function SpellListPage() {
  const { isAdmin, isAuthenticated, user } = useAuth();
  const [spells, setSpells] = useState<SrdSpell[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<SrdSpell | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManageDetail =
    !!detail &&
    ((detail.contentSource === 'homebrew' && detail.createdById === user?.userId) ||
      (detail.contentSource === 'shared' && isAdmin));

  async function handleDeleteSpell() {
    if (!detail) return;
    try {
      await apiFetch(`/srd/spells/${detail.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${detail.name}`);
      setDetailOpen(false);
      // Refetch so the deleted spell drops out of the current page, clamping
      // in case the last row of the final page just went away.
      const lastPageAfterDelete = Math.max(1, Math.ceil((total - 1) / LIMIT));
      setPage(p => Math.min(p, lastPageAfterDelete));
      setRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete spell');
    }
  }

  function openSpell(id: string) {
    setDetail(null);
    setDetailLoading(true);
    setDetailOpen(true);
    apiFetch<SrdSpell | null>(`/srd/spells/${id}`)
      .then(spell => {
        // The endpoint resolves 200 null for ids outside the caller's
        // visibility (deleted, or someone else's homebrew) — without this
        // guard the modal sticks on "Loading spell…" forever.
        if (!spell) {
          toast.error('Spell not found', { id: 'load-spell' });
          setDetailOpen(false);
          return;
        }
        setDetail(spell);
      })
      .catch(err => {
        console.error('Failed to load spell:', err);
        toast.error('Failed to load spell', { id: 'load-spell' });
        setDetailOpen(false);
      })
      .finally(() => setDetailLoading(false));
  }

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, levelFilter, schoolFilter, classFilter]);

  // Fetch spells from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (search) params.set('q', search);
    if (levelFilter !== '') params.set('level', levelFilter);
    if (schoolFilter) params.set('school', schoolFilter);
    if (classFilter) params.set('class', classFilter);

    apiFetch<PaginatedResponse<SrdSpell>>(`/srd/spells?${params.toString()}`)
      .then(res => {
        setSpells(res.data);
        setTotal(res.total);
        setLastPage(res.lastPage);
        // Self-healing clamp (VEG-291 pattern): if a delete elsewhere shrank
        // the list, don't strand the user on an empty out-of-range page.
        if (res.data.length === 0 && page > Math.max(1, res.lastPage)) {
          setPage(Math.max(1, res.lastPage));
        }
      })
      .catch(err => {
        console.error('Failed to load spells:', err);
        toast.error('Failed to load spells', { id: 'load-spells' });
      })
      .finally(() => setLoading(false));
  }, [page, search, levelFilter, schoolFilter, classFilter, refreshKey]);

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Spells</h1>
        {isAuthenticated && (
          <Link
            href="/srd/spells/new"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            Create spell
          </Link>
        )}
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
          onChange={e => setLevelFilter(e.target.value)}
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
          onChange={e => setSchoolFilter(e.target.value)}
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
          onChange={e => setClassFilter(e.target.value)}
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

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {loading ? 'Loading spells…' : `${total} spell${total !== 1 ? 's' : ''} found`}
      </p>

      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}
        aria-busy={loading}
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
                  <span className="ml-2 inline-block rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-medium align-middle">
                    Homebrew
                  </span>
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

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} label={detail?.name ?? 'Spell'}>
        {detailLoading || !detail ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading spell…
          </p>
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
                    <span className="ml-2 inline-block rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-medium align-middle">
                      Homebrew
                    </span>
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

function SpellDetail({ spell }: { spell: SrdSpell }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Casting Time</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.castingTime}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Range</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.range}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Components</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.components}</p>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Duration</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.duration}</p>
        </div>
      </div>
      {spell.material && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Material</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.material}</p>
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Description</h3>
        <Markdown>{spell.description}</Markdown>
      </div>
      {spell.higherLevels && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">At Higher Levels</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">{spell.higherLevels}</p>
        </div>
      )}
      {spell.classes.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Classes</h3>
          <div className="flex flex-wrap gap-1 mt-1">
            {spell.classes.map(c => (
              <span
                key={c}
                className="text-xs px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
