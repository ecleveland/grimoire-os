'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import type { SrdMonster, PaginatedResponse, Encounter } from '@/lib/types';
import Pagination from '@/components/Pagination';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import PrintToggle from '@/components/PrintToggle';
import EncounterPicker from '@/components/EncounterPicker';
import AddToEncounterDialog, { type AddToEncounterResult } from '@/components/AddToEncounterDialog';
import { buildMonsterCombatants } from '@/lib/encounter-combatants';
import { formatCr } from '@/lib/srd-format';

const LIMIT = 20;

const MONSTER_TYPES = [
  'Aberration',
  'Beast',
  'Celestial',
  'Construct',
  'Dragon',
  'Elemental',
  'Fey',
  'Fiend',
  'Giant',
  'Humanoid',
  'Monstrosity',
  'Ooze',
  'Plant',
  'Undead',
];

const CHALLENGE_RATINGS = [
  '0',
  '1/8',
  '1/4',
  '1/2',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
];

export default function MonsterListPage() {
  const { isDm, isAdmin, isAuthenticated, user } = useAuth();
  const [monsters, setMonsters] = useState<SrdMonster[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [crFilter, setCrFilter] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<SrdMonster | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addMode, setAddMode] = useState<'none' | 'picker' | 'dialog'>('none');
  const [addEncounterId, setAddEncounterId] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The owner may edit/delete their homebrew; admins curate shared content.
  const canManageDetail =
    !!detail &&
    ((detail.contentSource === 'homebrew' && detail.createdById === user?.userId) ||
      (detail.contentSource === 'shared' && isAdmin));

  async function handleDeleteMonster() {
    if (!detail) return;
    try {
      await apiFetch(`/srd/monsters/${detail.id}`, { method: 'DELETE' });
      toast.success(`Deleted ${detail.name}`);
      setDetailOpen(false);
      // Refetch so the deleted monster drops out of the current page.
      setRefreshKey(k => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete monster');
    }
  }

  function openMonster(id: string) {
    setDetail(null);
    setDetailLoading(true);
    setDetailOpen(true);
    setAddMode('none');
    setAddEncounterId('');
    apiFetch<SrdMonster>(`/srd/monsters/${id}`)
      .then(setDetail)
      .catch(err => {
        console.error('Failed to load monster:', err);
        toast.error('Failed to load monster', { id: 'load-monster' });
        setDetailOpen(false);
      })
      .finally(() => setDetailLoading(false));
  }

  // Add the monster to a chosen encounter (VEG-260). No ambient encounter here,
  // so the target is picked first; the write fetches the encounter fresh for its
  // version + combatants, then PATCHes with `expectedVersion` so a concurrent
  // edit yields a 409 instead of a silent overwrite.
  async function handleConfirmAdd(
    monster: SrdMonster,
    { quantity, initiatives }: AddToEncounterResult
  ) {
    setAddSubmitting(true);
    try {
      const encounter = await apiFetch<Encounter>(`/encounters/${addEncounterId}`);
      const additions = buildMonsterCombatants(
        monster,
        { quantity, initiatives },
        encounter.combatants.map(c => c.name)
      );
      await apiFetch<Encounter>(`/encounters/${addEncounterId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          combatants: [...encounter.combatants, ...additions],
          expectedVersion: encounter.version,
        }),
      });
      toast.success(
        quantity > 1
          ? `Added ${quantity} ${monster.name}s to the encounter`
          : `Added ${monster.name} to the encounter`
      );
      setDetailOpen(false);
      setAddMode('none');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error('That encounter changed since you loaded it — please try again.');
      } else {
        toast.error(err instanceof Error ? err.message : 'Failed to add to encounter');
      }
    } finally {
      setAddSubmitting(false);
    }
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
  }, [search, typeFilter, crFilter]);

  // Fetch monsters from API
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(LIMIT));
    if (search) params.set('q', search);
    if (typeFilter) params.set('type', typeFilter);
    if (crFilter) params.set('cr', crFilter);

    apiFetch<PaginatedResponse<SrdMonster>>(`/srd/monsters?${params.toString()}`)
      .then(res => {
        setMonsters(res.data);
        setTotal(res.total);
        setLastPage(res.lastPage);
      })
      .catch(err => {
        console.error('Failed to load monsters:', err);
        toast.error('Failed to load monsters', { id: 'load-monsters' });
      })
      .finally(() => setLoading(false));
  }, [page, search, typeFilter, crFilter, refreshKey]);

  const inputClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Monsters</h1>
        {isAuthenticated && (
          <Link
            href="/srd/monsters/new"
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            Create monster
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <input
          type="text"
          placeholder="Search monsters..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className={inputClass}
        />
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className={inputClass}
        >
          <option value="">All Types</option>
          {MONSTER_TYPES.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={crFilter} onChange={e => setCrFilter(e.target.value)} className={inputClass}>
          <option value="">All CRs</option>
          {CHALLENGE_RATINGS.map(cr => (
            <option key={cr} value={cr}>
              CR {cr}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        {loading ? 'Loading monsters…' : `${total} monster${total !== 1 ? 's' : ''} found`}
      </p>

      <div
        className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}
        aria-busy={loading}
      >
        {monsters.map(m => (
          // The print toggle is an absolutely-positioned sibling (not a child)
          // of the card button — buttons cannot nest.
          <div key={m.id} className="relative">
            <button
              type="button"
              data-testid="monster-card"
              onClick={() => openMonster(m.id)}
              className="w-full h-full text-left p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            >
              <h3 className="font-semibold text-gray-900 dark:text-white pr-8">{m.name}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {m.size} {m.type} &middot; {m.alignment}
                {m.contentSource === 'homebrew' && (
                  <span className="ml-2 inline-block rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 text-xs font-medium align-middle">
                    Homebrew
                  </span>
                )}
              </p>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center text-sm">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">CR</div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {formatCr(m.challengeRating)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">HP</div>
                  <div className="font-medium text-gray-900 dark:text-white">{m.hitPoints}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">AC</div>
                  <div className="font-medium text-gray-900 dark:text-white">{m.armorClass}</div>
                </div>
              </div>
            </button>
            <PrintToggle
              type="monster"
              id={m.id}
              name={m.name}
              className="absolute top-3 right-3"
            />
          </div>
        ))}
      </div>

      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        label={detail?.name ?? 'Monster'}
      >
        {detailLoading || !detail ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading monster…
          </p>
        ) : addMode === 'picker' ? (
          <EncounterPicker
            onSelect={id => {
              setAddEncounterId(id);
              setAddMode('dialog');
            }}
            onCancel={() => setAddMode('none')}
          />
        ) : addMode === 'dialog' ? (
          <AddToEncounterDialog
            monster={detail}
            submitting={addSubmitting}
            onConfirm={result => handleConfirmAdd(detail, result)}
            onCancel={() => setAddMode('picker')}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              {canManageDetail && (
                <>
                  <Link
                    href={`/srd/monsters/${detail.id}/edit`}
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
              {isDm && (
                <button
                  type="button"
                  onClick={() => setAddMode('picker')}
                  className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Add to encounter
                </button>
              )}
              <PrintToggle type="monster" id={detail.id} name={detail.name} variant="button" />
            </div>
            <MonsterStatBlock monster={detail} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete monster?"
        description={`"${detail?.name ?? 'This monster'}" will be permanently deleted. Encounter combatants created from it keep their stats but lose the stat-block link. This cannot be undone.`}
        confirmLabel="Delete monster"
        variant="danger"
        onConfirm={handleDeleteMonster}
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
