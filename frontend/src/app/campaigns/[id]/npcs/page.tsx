'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import Pagination from '@/components/Pagination';
import { NPC_PROFESSIONS, NPC_RACES } from '@/lib/npc-constants';
import type { NpcListItem, PaginatedResponse } from '@/lib/types';

const LIMIT = 20;

export default function NpcsListPage() {
  const { id } = useParams<{ id: string }>();
  const [npcs, setNpcs] = useState<NpcListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [lastPage, setLastPage] = useState(1);
  const [page, setPage] = useState(1);
  const [race, setRace] = useState('');
  const [profession, setProfession] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      campaignId: id,
      page: String(page),
      limit: String(LIMIT),
    });
    if (race) params.set('race', race);
    if (profession) params.set('profession', profession);
    setLoading(true);
    apiFetch<PaginatedResponse<NpcListItem>>(`/npcs?${params.toString()}`)
      .then(res => {
        setNpcs(res.data);
        setTotal(res.total);
        setLastPage(res.lastPage);
      })
      .catch(err => {
        console.error('Failed to load NPCs:', err);
        toast.error('Failed to load NPCs', { id: 'load-npcs' });
      })
      .finally(() => setLoading(false));
  }, [id, page, race, profession]);

  const handleFilterChange = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const filterClass =
    'px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent';

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">NPCs</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            <Link href={`/campaigns/${id}`} className="text-indigo-600 hover:text-indigo-700">
              ← Back to campaign
            </Link>
          </p>
        </div>
        <Link
          href={`/campaigns/${id}/npcs/new`}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          New NPC
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Race</span>
          <select
            aria-label="Race"
            value={race}
            onChange={e => handleFilterChange(setRace)(e.target.value)}
            className={filterClass}
          >
            <option value="">All</option>
            {NPC_RACES.map(r => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Profession</span>
          <select
            aria-label="Profession"
            value={profession}
            onChange={e => handleFilterChange(setProfession)(e.target.value)}
            className={filterClass}
          >
            <option value="">All</option>
            {NPC_PROFESSIONS.map(p => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && npcs.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Loading...</p>
      ) : npcs.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">No NPCs yet.</p>
      ) : (
        <>
          <div className="space-y-3">
            {npcs.map(npc => (
              <Link
                key={npc.id}
                href={`/campaigns/${id}/npcs/${npc.id}`}
                className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-gray-900 dark:text-white">{npc.name}</h3>
                  {npc.alignment && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                      {npc.alignment}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {npc.profession ? `${npc.race} · ${npc.profession}` : npc.race}
                </p>
              </Link>
            ))}
          </div>
          <Pagination
            page={page}
            lastPage={lastPage}
            total={total}
            limit={LIMIT}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
