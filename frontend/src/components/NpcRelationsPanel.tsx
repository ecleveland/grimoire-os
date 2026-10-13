'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api';
import { invalidateApiPath, useApiMutation, useApiQuery } from '@/lib/query';
import ConfirmDialog from '@/components/ConfirmDialog';
import SearchBox from '@/components/SearchBox';
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
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'view' | 'add' | 'generate'>('view');
  const [pendingRemoval, setPendingRemoval] = useState<NpcRelation | null>(null);

  const removeRelation = useApiMutation(
    (rel: NpcRelation) =>
      apiFetch<void>(`/npcs/${npc.id}/relations/${rel.id}`, { method: 'DELETE' }),
    {
      onSuccess: (_data, rel) => {
        toast.success('Relation removed');
        onRefetch();
        // The backend deletes the inverse row on the target NPC as well.
        void invalidateApiPath(queryClient, `/npcs/${rel.toNpcId}`);
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to remove relation');
      },
    }
  );

  const addRelation = useApiMutation(
    ({ target, relation }: { target: Npc; relation: string }) =>
      apiFetch(`/npcs/${npc.id}/relations`, {
        method: 'POST',
        body: JSON.stringify({ toNpcId: target.id, relation }),
      }),
    {
      onSuccess: (_data, { target, relation }) => {
        toast.success(`Linked ${target.name} as ${relation}`);
        setMode('view');
        onRefetch();
        // The backend writes the inverse row on the target NPC as well.
        void invalidateApiPath(queryClient, `/npcs/${target.id}`);
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to add relation');
      },
    }
  );

  const generateRelated = useApiMutation(
    (relation: string) =>
      apiFetch<Npc>(`/npcs/${npc.id}/relations/generate`, {
        method: 'POST',
        body: JSON.stringify({ relation }),
      }),
    {
      onSuccess: (created, relation) => {
        toast.success(`Generated ${relation}: ${created.name}`);
        setMode('view');
        // The source NPC gained a link and the list gained a row.
        onRefetch();
        void invalidateApiPath(queryClient, '/npcs?');
        router.push(`/campaigns/${npc.campaignId}/npcs/${created.id}`);
      },
      onError: err => {
        toast.error(err instanceof Error ? err.message : 'Failed to generate related NPC');
      },
    }
  );

  const busy =
    removeRelation.isPending ||
    addRelation.isPending ||
    generateRelated.isPending ||
    generateRelated.isSuccess;

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
          busy={busy}
          onCancel={() => setMode('view')}
          onPick={(target, relation) => addRelation.mutate({ target, relation })}
        />
      )}

      {mode === 'generate' && (
        <GenerateRelatedForm
          busy={busy}
          onCancel={() => setMode('view')}
          onGenerate={relation => generateRelated.mutate(relation)}
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
                  <Link
                    href={`/campaigns/${npc.campaignId}/npcs/${rel.toNpc.id}`}
                    className="text-indigo-600 hover:text-indigo-700"
                  >
                    {rel.toNpc.name}
                  </Link>
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
                onClick={() => setPendingRemoval(rel)}
                disabled={busy}
                className="px-2 py-1 text-xs border border-red-300 dark:border-red-700 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={open => {
          if (!open) setPendingRemoval(null);
        }}
        title="Remove relation?"
        description={
          pendingRemoval
            ? `Remove the "${pendingRemoval.relation}" relation to ${pendingRemoval.toNpc?.name ?? pendingRemoval.toNpcId}? Both directions will be deleted.`
            : ''
        }
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          if (pendingRemoval) removeRelation.mutate(pendingRemoval);
        }}
      />
    </div>
  );
}

// ── Add Existing NPC form ────────────────────────────────────────────────────

function AddRelationForm({
  npc,
  busy,
  onCancel,
  onPick,
}: {
  npc: Npc;
  busy: boolean;
  onCancel: () => void;
  onPick: (target: Npc, relation: string) => void;
}) {
  const [relation, setRelation] = useState<string>('parent');
  const [query, setQuery] = useState('');

  // Stable callback so SearchBox's debounce effect doesn't re-arm per render.
  const handleDebouncedSearch = useCallback((value: string) => setQuery(value.trim()), []);

  // Search server-side so matches beyond the first page are reachable; only
  // the exclude-self filter stays on the client.
  const search = useApiQuery<PaginatedResponse<Npc>>(
    `/npcs?campaignId=${encodeURIComponent(npc.campaignId)}&search=${encodeURIComponent(query)}&limit=10`,
    { enabled: query !== '', placeholderData: keepPreviousData }
  );
  const rows = query && search.data ? search.data.data : [];
  const candidates = rows.filter(n => n.id !== npc.id);
  // Don't count rows excluded client-side (the NPC being edited) toward the
  // "more matches exist" hint.
  const total = query && search.data ? search.data.total - (rows.length - candidates.length) : 0;

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
      <SearchBox
        placeholder="Search NPCs by name…"
        onDebouncedChange={handleDebouncedSearch}
        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
      />
      {candidates.length > 0 && (
        <ul className="border border-gray-200 dark:border-gray-700 rounded divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
          {candidates.map(c => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c, relation)}
                disabled={busy}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
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
      {total > candidates.length && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Showing {candidates.length} of {total}. Refine your search to narrow results.
        </p>
      )}
    </div>
  );
}

// ── Generate Related NPC form ─────────────────────────────────────────────────

function GenerateRelatedForm({
  busy,
  onCancel,
  onGenerate,
}: {
  busy: boolean;
  onCancel: () => void;
  onGenerate: (relation: string) => void;
}) {
  const [relation, setRelation] = useState<string>('parent');

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
          onClick={() => onGenerate(relation)}
          disabled={busy}
          className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
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
