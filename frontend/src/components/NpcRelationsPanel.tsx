'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import type { Npc, NpcRelation, PaginatedResponse } from '@/lib/types';

const RELATION_TYPES = [
  'parent',
  'child',
  'sibling',
  'spouse',
  'mentor',
  'student',
  'rival',
  'ally',
  'friend',
  'enemy',
  'boss',
  'subordinate',
] as const;

interface NpcRelationsPanelProps {
  npc: Npc;
  onRefetch: () => void;
}

export default function NpcRelationsPanel({ npc, onRefetch }: NpcRelationsPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'add' | 'generate'>('view');

  const handleRemove = async (rel: NpcRelation) => {
    const target = rel.toNpc?.name ?? rel.toNpcId;
    if (
      !window.confirm(
        `Remove the "${rel.relation}" relation to ${target}? Both directions will be deleted.`
      )
    )
      return;
    setBusy(true);
    try {
      await apiFetch<void>(`/npcs/${npc.id}/relations/${rel.id}`, { method: 'DELETE' });
      toast.success('Relation removed');
      onRefetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove relation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Relations</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode(mode === 'add' ? 'view' : 'add')}
            disabled={busy}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 transition-colors"
          >
            Add Existing NPC
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === 'generate' ? 'view' : 'generate')}
            disabled={busy}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Generate Related NPC
          </button>
        </div>
      </div>

      {mode === 'add' && (
        <AddRelationForm
          npc={npc}
          onCancel={() => setMode('view')}
          onAdded={() => {
            setMode('view');
            onRefetch();
          }}
          setBusy={setBusy}
        />
      )}

      {mode === 'generate' && (
        <GenerateRelatedForm
          npc={npc}
          onCancel={() => setMode('view')}
          onGenerated={newNpc => {
            setMode('view');
            router.push(`/campaigns/${npc.campaignId}/npcs/${newNpc.id}`);
          }}
          setBusy={setBusy}
        />
      )}

      {(npc.outgoingLinks?.length ?? 0) === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No relations yet.</p>
      ) : (
        <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2">
          {npc.outgoingLinks?.map(rel => (
            <li
              key={rel.id}
              className="flex items-center justify-between gap-2 py-1 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
            >
              <div>
                <span className="font-medium">{rel.relation}</span>
                {' of '}
                {rel.toNpc ? (
                  <a
                    href={`/campaigns/${npc.campaignId}/npcs/${rel.toNpc.id}`}
                    className="text-indigo-600 hover:text-indigo-700"
                  >
                    {rel.toNpc.name}
                  </a>
                ) : (
                  <span className="text-gray-500">{rel.toNpcId}</span>
                )}
                {rel.toNpc?.race && (
                  <span className="text-gray-500 dark:text-gray-400"> · {rel.toNpc.race}</span>
                )}
                {rel.notes && (
                  <span className="text-gray-500 dark:text-gray-400"> — {rel.notes}</span>
                )}
              </div>
              <button
                type="button"
                aria-label={`Remove relation ${rel.relation} to ${rel.toNpc?.name ?? rel.toNpcId}`}
                onClick={() => handleRemove(rel)}
                disabled={busy}
                className="px-2 py-1 text-xs border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Add Existing NPC form ────────────────────────────────────────────────────

function AddRelationForm({
  npc,
  onCancel,
  onAdded,
  setBusy,
}: {
  npc: Npc;
  onCancel: () => void;
  onAdded: () => void;
  setBusy: (b: boolean) => void;
}) {
  const [relation, setRelation] = useState<string>('parent');
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Npc[]>([]);
  const fetchSeq = useRef(0);

  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed) {
      setCandidates([]);
      return;
    }
    const seq = ++fetchSeq.current;
    apiFetch<PaginatedResponse<Npc>>(
      `/npcs?campaignId=${encodeURIComponent(npc.campaignId)}&limit=10`
    )
      .then(res => {
        if (seq !== fetchSeq.current) return;
        const filtered = res.data
          .filter(n => n.id !== npc.id)
          .filter(n => n.name.toLowerCase().includes(trimmed.toLowerCase()));
        setCandidates(filtered);
      })
      .catch(() => setCandidates([]));
  }, [search, npc.id, npc.campaignId]);

  const handlePick = useCallback(
    async (target: Npc) => {
      setBusy(true);
      try {
        await apiFetch(`/npcs/${npc.id}/relations`, {
          method: 'POST',
          body: JSON.stringify({ toNpcId: target.id, relation }),
        });
        toast.success(`Linked ${target.name} as ${relation}`);
        onAdded();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to add relation');
      } finally {
        setBusy(false);
      }
    },
    [npc.id, relation, onAdded, setBusy]
  );

  return (
    <div className="mb-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/30 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="add-relation-type" className="text-sm text-gray-700 dark:text-gray-300">
          Relation type
        </label>
        <select
          id="add-relation-type"
          value={relation}
          onChange={e => setRelation(e.target.value)}
          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
        >
          {RELATION_TYPES.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          Cancel
        </button>
      </div>
      <input
        type="text"
        placeholder="Search NPCs by name…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
      />
      {candidates.length > 0 && (
        <ul className="border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
          {candidates.map(c => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => handlePick(c)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  {' '}
                  · {c.race}
                  {c.profession ? ` · ${c.profession}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Generate Related NPC form ─────────────────────────────────────────────────

function GenerateRelatedForm({
  npc,
  onCancel,
  onGenerated,
  setBusy,
}: {
  npc: Npc;
  onCancel: () => void;
  onGenerated: (newNpc: Npc) => void;
  setBusy: (b: boolean) => void;
}) {
  const [relation, setRelation] = useState<string>('parent');

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const created = await apiFetch<Npc>(`/npcs/${npc.id}/relations/generate`, {
        method: 'POST',
        body: JSON.stringify({ relation }),
      });
      toast.success(`Generated ${relation}: ${created.name}`);
      onGenerated(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate related NPC');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/30 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <label
          htmlFor="generate-relation-type"
          className="text-sm text-gray-700 dark:text-gray-300"
        >
          Relation type
        </label>
        <select
          id="generate-relation-type"
          value={relation}
          onChange={e => setRelation(e.target.value)}
          className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
        >
          {RELATION_TYPES.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:underline"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Generate
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        The new NPC will inherit race + family name from this one where appropriate, and will be
        saved with the chosen relation in both directions.
      </p>
    </div>
  );
}
