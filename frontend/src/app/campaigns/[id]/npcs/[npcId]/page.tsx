'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import ConfirmDialog from '@/components/ConfirmDialog';
import NpcFieldRow from '@/components/NpcFieldRow';
import NpcRelationsPanel from '@/components/NpcRelationsPanel';
import { NpcStatBlockCard, type NpcStatBlockShape } from '@/components/NpcStatBlockCard';
import type { Npc, NpcLootItem, NpcRerollField } from '@/lib/types';
import { formatCoinage } from '@/lib/coinage';

// Fields rendered as a labelled row with dice + lock controls. The stat block
// has its own dedicated card and Generate / Remove buttons, so it is not part
// of this map even though it is rerollable.
type RowField = Exclude<NpcRerollField, 'all' | 'statBlock'>;

const FIELD_LABELS: Record<RowField, string> = {
  race: 'Race',
  background: 'Background',
  profession: 'Profession',
  alignment: 'Alignment',
  name: 'Name',
  appearance: 'Appearance',
  personality: 'Personality',
  loot: 'Loot',
};

function isLocked(npc: Npc, field: string): boolean {
  return npc.lockedFields.includes(field);
}

function lootItems(loot: Npc['loot']): NpcLootItem[] {
  if (!loot) return [];
  if (Array.isArray(loot)) return loot as NpcLootItem[];
  return [];
}

function statBlockShape(sb: Npc['statBlock']): NpcStatBlockShape | null {
  if (!sb || Array.isArray(sb)) return null;
  // The backend persists NpcStatBlock as JSONB matching this shape; we trust
  // the runtime contract here rather than re-deriving a schema.
  return sb as unknown as NpcStatBlockShape;
}

export default function NpcDetailPage() {
  const { id: campaignId, npcId } = useParams<{ id: string; npcId: string }>();
  const router = useRouter();
  const { user, isDm } = useAuth();
  const [npc, setNpc] = useState<Npc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmRerollAllOpen, setConfirmRerollAllOpen] = useState(false);
  const [confirmRemoveStatBlockOpen, setConfirmRemoveStatBlockOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const fetchNpc = useCallback(() => {
    apiFetch<Npc>(`/npcs/${npcId}`)
      .then(setNpc)
      .catch(() => toast.error('Failed to load NPC'))
      .finally(() => setLoading(false));
  }, [npcId]);

  useEffect(() => {
    fetchNpc();
  }, [fetchNpc]);

  const reroll = async (field: NpcRerollField) => {
    if (!npc) return;
    setBusy(true);
    try {
      const updated = await apiFetch<Npc>(`/npcs/${npcId}/reroll`, {
        method: 'POST',
        body: JSON.stringify({ field }),
      });
      setNpc(updated);
      toast.success(field === 'all' ? 'NPC re-rolled' : `Re-rolled ${field}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reroll');
    } finally {
      setBusy(false);
    }
  };

  const toggleLock = async (field: RowField) => {
    if (!npc) return;
    const next = npc.lockedFields.includes(field)
      ? npc.lockedFields.filter(f => f !== field)
      : [...npc.lockedFields, field];
    setBusy(true);
    try {
      const updated = await apiFetch<Npc>(`/npcs/${npcId}`, {
        method: 'PATCH',
        body: JSON.stringify({ lockedFields: next }),
      });
      setNpc(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update lock');
    } finally {
      setBusy(false);
    }
  };

  const handleRerollAll = () => {
    if (!npc) return;
    if (npc.lockedFields.length > 0) {
      setConfirmRerollAllOpen(true);
      return;
    }
    reroll('all');
  };

  const performRemoveStatBlock = async () => {
    if (!npc) return;
    setBusy(true);
    try {
      const updated = await apiFetch<Npc>(`/npcs/${npcId}`, {
        method: 'PATCH',
        body: JSON.stringify({ statBlock: null }),
      });
      setNpc(updated);
      toast.success('Stat block removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove stat block');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateStatBlock = () => reroll('statBlock');

  const performDelete = async () => {
    if (!npc) return;
    setBusy(true);
    try {
      await apiFetch<void>(`/npcs/${npcId}`, { method: 'DELETE' });
      toast.success('NPC deleted');
      router.push(`/campaigns/${campaignId}/npcs`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete NPC');
      setBusy(false);
    }
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!npc) return <div className="text-gray-500 dark:text-gray-400">NPC not found.</div>;

  const personalityValue = [
    ...npc.personalityTraits.map(t => `• ${t}`),
    ...npc.ideals.map(t => `Ideal: ${t}`),
    ...npc.bonds.map(t => `Bond: ${t}`),
    ...npc.flaws.map(t => `Flaw: ${t}`),
  ].join('\n');

  const items = lootItems(npc.loot);

  // Backend reroll access is campaign-owner scoped; mirror the encounter-page
  // gate (DM role or creator) since the campaign's ownerId isn't in this payload.
  const canRerollLoot = isDm || (user != null && npc.createdById === user.userId);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <Link
            href={`/campaigns/${campaignId}/npcs`}
            className="text-sm text-indigo-600 hover:text-indigo-700"
          >
            ← Back to NPCs
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{npc.name}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {npc.race}
            {npc.profession ? ` · ${npc.profession}` : ''}
            {npc.alignment ? ` · ${npc.alignment}` : ''}
            {npc.isManual && ' · manual'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleRerollAll}
            disabled={busy}
            className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            Reroll All
          </button>
          <Link
            href={`/campaigns/${campaignId}/npcs/${npcId}/edit`}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={busy}
            className="px-3 py-1.5 text-sm border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Profile</h2>
        <NpcFieldRow
          field="name"
          label={FIELD_LABELS.name}
          value={npc.name}
          locked={isLocked(npc, 'name')}
          onReroll={reroll}
          onToggleLock={toggleLock}
        />
        <NpcFieldRow
          field="race"
          label={FIELD_LABELS.race}
          value={npc.race}
          locked={isLocked(npc, 'race')}
          onReroll={reroll}
          onToggleLock={toggleLock}
        />
        <NpcFieldRow
          field="background"
          label={FIELD_LABELS.background}
          value={npc.background}
          locked={isLocked(npc, 'background')}
          onReroll={reroll}
          onToggleLock={toggleLock}
        />
        <NpcFieldRow
          field="profession"
          label={FIELD_LABELS.profession}
          value={npc.profession}
          locked={isLocked(npc, 'profession')}
          onReroll={reroll}
          onToggleLock={toggleLock}
        />
        <NpcFieldRow
          field="alignment"
          label={FIELD_LABELS.alignment}
          value={npc.alignment}
          locked={isLocked(npc, 'alignment')}
          onReroll={reroll}
          onToggleLock={toggleLock}
        />
        <NpcFieldRow
          field="appearance"
          label={FIELD_LABELS.appearance}
          value={npc.appearance}
          locked={isLocked(npc, 'appearance')}
          onReroll={reroll}
          onToggleLock={toggleLock}
        />
        <NpcFieldRow
          field="personality"
          label={FIELD_LABELS.personality}
          value={personalityValue || null}
          locked={isLocked(npc, 'personality')}
          onReroll={reroll}
          onToggleLock={toggleLock}
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Loot</h2>
          {canRerollLoot && (
            <button
              type="button"
              onClick={() => reroll('loot')}
              disabled={busy || isLocked(npc, 'loot')}
              aria-label="Reroll loot"
              title={isLocked(npc, 'loot') ? 'Loot is locked' : 'Reroll loot'}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              ↻ Reroll Loot
            </button>
          )}
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
          {formatCoinage({ gp: npc.goldPieces, sp: npc.silverPieces, cp: npc.copperPieces })}
        </div>
        <NpcFieldRow
          field="loot"
          label="Items"
          value={
            items.length > 0 ? (
              <ul className="list-disc list-inside space-y-1">
                {items.map((item, i) => (
                  <li key={i}>
                    {item.quantity}× {item.name}
                  </li>
                ))}
              </ul>
            ) : null
          }
          locked={isLocked(npc, 'loot')}
          onReroll={reroll}
          onToggleLock={toggleLock}
        />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Stat Block</h2>
          {statBlockShape(npc.statBlock) ? (
            <button
              type="button"
              onClick={() => setConfirmRemoveStatBlockOpen(true)}
              disabled={busy}
              className="px-3 py-1.5 text-sm border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50 transition-colors"
            >
              Remove Stat Block
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGenerateStatBlock}
              disabled={busy}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              Generate Stat Block
            </button>
          )}
        </div>
        {statBlockShape(npc.statBlock) ? (
          <NpcStatBlockCard statBlock={statBlockShape(npc.statBlock)!} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No stat block (Lite NPC). Click <strong>Generate Stat Block</strong> to roll one.
          </p>
        )}
      </div>

      <NpcRelationsPanel npc={npc} onRefetch={fetchNpc} />

      <ConfirmDialog
        open={confirmRerollAllOpen}
        onOpenChange={setConfirmRerollAllOpen}
        title="Reroll all fields?"
        description={`${npc.lockedFields.length} field(s) are locked and will be preserved. Continue?`}
        confirmLabel="Continue"
        variant="default"
        onConfirm={() => reroll('all')}
      />
      <ConfirmDialog
        open={confirmRemoveStatBlockOpen}
        onOpenChange={setConfirmRemoveStatBlockOpen}
        title="Remove stat block?"
        description="Remove the stat block from this NPC?"
        confirmLabel="Remove"
        variant="danger"
        onConfirm={performRemoveStatBlock}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete NPC?"
        description={`Delete "${npc.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={performDelete}
      />
    </div>
  );
}
