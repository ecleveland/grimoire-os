'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type { Combatant, Encounter, SrdMonster } from '@/lib/types';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import MonsterLookupPanel from '@/components/MonsterLookupPanel';
import { buildMonsterCombatants } from '@/lib/encounter-combatants';
import type { AddToEncounterResult } from '@/components/AddToEncounterDialog';

// The single ordering rule for the tracker — render, turn order, and HP
// commits must all agree on it.
const sortByInitiative = (combatants: Combatant[]) =>
  [...combatants].sort((a, b) => b.initiative - a.initiative);

export default function InitiativeTrackerPage() {
  const { encounterId } = useParams<{ id: string; encounterId: string }>();
  const { user, isDm } = useAuth();
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [loading, setLoading] = useState(true);
  // In-progress HP edit, committed on blur/Enter. Keyed by combatant name AND
  // the sorted-row index at draft time: the name lets the draft follow its
  // combatant if the list reorders, while the index disambiguates hand-entered
  // duplicate names (nothing enforces name uniqueness).
  const [hpDraft, setHpDraft] = useState<{ name: string; index: number; value: string } | null>(
    null
  );
  const [viewMonster, setViewMonster] = useState<SrdMonster | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  const fetchEncounter = useCallback(() => {
    apiFetch<Encounter>(`/encounters/${encounterId}`)
      .then(setEncounter)
      .catch(() => toast.error('Failed to load encounter'))
      .finally(() => setLoading(false));
  }, [encounterId]);

  useEffect(() => {
    fetchEncounter();
  }, [fetchEncounter]);

  // Shared 409 recovery: another writer won the version race — refetch and let
  // the user retry against fresh state. Returns true if the error was handled.
  const handleEncounterConflict = (err: unknown): boolean => {
    if (err instanceof ApiError && err.status === 409) {
      toast.error('This encounter changed since you opened it — refreshed, please try again.');
      fetchEncounter();
      return true;
    }
    return false;
  };

  // All writes carry `expectedVersion` so concurrent edits surface as a 409
  // instead of silently clobbering each other (VEG-315, same guard as VEG-260/137).
  const patchEncounter = async (updates: Partial<Encounter>) => {
    if (!encounter) return;
    try {
      const updated = await apiFetch<Encounter>(`/encounters/${encounterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...updates, expectedVersion: encounter.version }),
      });
      setEncounter(updated);
    } catch (err) {
      if (handleEncounterConflict(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to update encounter');
    }
  };

  const nextTurn = () => {
    if (!encounter) return;
    const sorted = sortByInitiative(encounter.combatants);
    const activeCombatants = sorted.filter(c => c.hp > 0);
    if (activeCombatants.length === 0) return;

    let nextIndex = encounter.currentTurn + 1;
    let newRound = encounter.round;
    if (nextIndex >= sorted.length) {
      nextIndex = 0;
      newRound += 1;
    }
    patchEncounter({ currentTurn: nextIndex, round: newRound });
  };

  // Commit the drafted HP: one clamped, version-guarded PATCH. Empty/invalid
  // or unchanged drafts revert silently. Target resolution: a unique name is
  // looked up fresh (correct even if the list reordered mid-edit); a duplicated
  // name falls back to the draft's row index, bailing out unless that row still
  // holds the name. A combatant removed mid-edit bails out too.
  const commitCombatantHp = (name: string) => {
    if (!encounter || !hpDraft || hpDraft.name !== name) return;
    const { index: draftIndex, value } = hpDraft;
    setHpDraft(null);
    const raw = value.trim();
    const parsed = Number(raw);
    if (raw === '' || Number.isNaN(parsed)) return;
    const sorted = sortByInitiative(encounter.combatants);
    const matches = sorted.flatMap((c, idx) => (c.name === name ? [idx] : []));
    const index =
      matches.length === 1 ? matches[0] : sorted[draftIndex]?.name === name ? draftIndex : -1;
    if (index === -1) return;
    const clamped = Math.max(0, Math.min(parsed, sorted[index].maxHp));
    if (clamped === sorted[index].hp) return;
    sorted[index] = { ...sorted[index], hp: clamped };
    patchEncounter({ combatants: sorted });
  };

  const toggleActive = () => {
    if (!encounter) return;
    patchEncounter({ isActive: !encounter.isActive });
  };

  // Append monster combatant(s) from the lookup panel. Kept separate from
  // patchEncounter for its add-specific success/error toasts.
  const addMonsterToEncounter = async (
    monster: SrdMonster,
    { quantity, initiatives }: AddToEncounterResult
  ) => {
    if (!encounter) return;
    const additions = buildMonsterCombatants(
      monster,
      { quantity, initiatives },
      encounter.combatants.map(c => c.name)
    );
    try {
      const updated = await apiFetch<Encounter>(`/encounters/${encounterId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          combatants: [...encounter.combatants, ...additions],
          expectedVersion: encounter.version,
        }),
      });
      setEncounter(updated);
      toast.success(
        quantity > 1
          ? `Added ${quantity} ${monster.name}s to the encounter`
          : `Added ${monster.name} to the encounter`
      );
    } catch (err) {
      if (handleEncounterConflict(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to add to encounter');
    }
  };

  const viewCombatantMonster = (monsterId: string) => {
    setViewMonster(null);
    setViewLoading(true);
    setViewOpen(true);
    apiFetch<SrdMonster>(`/srd/monsters/${monsterId}`)
      .then(setViewMonster)
      .catch(() => {
        toast.error('Failed to load monster');
        setViewOpen(false);
      })
      .finally(() => setViewLoading(false));
  };

  if (loading) return <div className="text-gray-500 dark:text-gray-400">Loading...</div>;
  if (!encounter)
    return <div className="text-gray-500 dark:text-gray-400">Encounter not found.</div>;

  const sorted = sortByInitiative(encounter.combatants);
  const isController = isDm || (user && encounter.createdBy === user.userId);
  // Mirror of the commit-target rule: a unique draft name binds to its (possibly
  // re-sorted) row; a duplicated one binds only to the exact row it was typed in.
  const draftNameIsUnique =
    hpDraft !== null && sorted.filter(c => c.name === hpDraft.name).length === 1;
  const rowHoldsDraft = (c: Combatant, i: number) =>
    hpDraft?.name === c.name && (draftNameIsUnique || hpDraft.index === i);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{encounter.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant={encounter.isActive ? 'success' : 'neutral'} size="md">
              {encounter.isActive ? 'Active' : 'Inactive'}
            </Badge>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              Round {encounter.round}
            </span>
          </div>
        </div>
        {isController && (
          <div className="flex gap-2">
            <button
              onClick={toggleActive}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            >
              {encounter.isActive ? 'End Combat' : 'Start Combat'}
            </button>
            <button
              onClick={nextTurn}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Next Turn
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {sorted.map((c, i) => {
          const isCurrent = i === encounter.currentTurn;
          const isDead = c.hp <= 0;
          return (
            <div
              key={`${c.name}-${i}`}
              className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                isCurrent
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                  : isDead
                    ? 'bg-red-50/50 dark:bg-red-900/10 border-gray-200 dark:border-gray-700 opacity-60'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
            >
              {isCurrent && (
                <span className="text-indigo-600 dark:text-indigo-400 text-lg font-bold">
                  &raquo;
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {c.monsterId ? (
                    <button
                      type="button"
                      onClick={() => viewCombatantMonster(c.monsterId!)}
                      className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded"
                    >
                      {c.name}
                    </button>
                  ) : (
                    <span className="font-medium text-gray-900 dark:text-white">{c.name}</span>
                  )}
                  {c.isNpc && (
                    <span className="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded">
                      NPC
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Init</div>
                  <div className="font-mono font-medium text-gray-900 dark:text-white">
                    {c.initiative}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">AC</div>
                  <div className="font-mono font-medium text-gray-900 dark:text-white">{c.ac}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">HP</div>
                  {isController ? (
                    <input
                      type="number"
                      value={rowHoldsDraft(c, i) ? hpDraft!.value : c.hp}
                      onChange={e => setHpDraft({ name: c.name, index: i, value: e.target.value })}
                      onBlur={() => commitCombatantHp(c.name)}
                      onKeyDown={e => {
                        // Enter commits via the blur handler — a single commit
                        // path, so it can't double-PATCH with a stale draft.
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      className="w-16 px-1 py-0.5 text-center font-mono font-medium border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  ) : (
                    <div className="font-mono font-medium text-gray-900 dark:text-white">
                      {c.hp}/{c.maxHp}
                    </div>
                  )}
                </div>
                {isController && <div className="text-xs text-gray-400">/{c.maxHp}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <MonsterLookupPanel canAdd={!!isController} onAdd={addMonsterToEncounter} />

      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        label={viewMonster?.name ?? 'Monster'}
      >
        {viewLoading || !viewMonster ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading monster…
          </p>
        ) : (
          <MonsterStatBlock monster={viewMonster} />
        )}
      </Modal>
    </div>
  );
}
