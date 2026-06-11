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
import { applyDamage, applyHeal, grantTempHp } from '@/lib/combatant-hp';
import type { AddToEncounterResult } from '@/components/AddToEncounterDialog';
import { aggregateCombatantLoot } from '@grimoire-os/shared';
import type {
  CombatantLootCoinage,
  CombatantLootItem,
  EncounterLootTotal,
} from '@grimoire-os/shared';
import ConfirmDialog from '@/components/ConfirmDialog';
import { formatCoinage } from '@/lib/coinage';

// The single ordering rule for the tracker — render, turn order, and HP
// commits must all agree on it. Returns a shallow copy: the elements keep
// their identity with the input array, which the loot index mapping below
// relies on (sorted row → stored-array index via indexOf).
const sortByInitiative = (combatants: Combatant[]) =>
  [...combatants].sort((a, b) => b.initiative - a.initiative);

const smallButtonBase =
  'shrink-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const lootButtonClass = `${smallButtonBase} text-gray-700 dark:text-gray-300`;

// A damage/heal/temp amount must be a positive whole number; anything else
// (empty, 0, decimals, text) keeps the action buttons disabled.
const parseAmount = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed > 0 ? parsed : null;
};

// Shared by the per-combatant drop and the encounter total — one copy of the
// coinage + item-list markup, so the two views can't drift apart.
function LootDisplay({
  coinage,
  items,
}: {
  coinage: CombatantLootCoinage;
  items: CombatantLootItem[];
}) {
  return (
    <div className="min-w-0">
      <span className="text-gray-700 dark:text-gray-300">{formatCoinage(coinage)}</span>
      {items.length > 0 && (
        <ul className="mt-1 list-disc list-inside text-gray-600 dark:text-gray-400">
          {items.map((item, j) => (
            <li key={j}>
              {item.quantity}&times; {item.name}
              {item.notes ? ` — ${item.notes}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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
  // In-progress damage/heal/temp amount (VEG-286), committed by the action
  // buttons. Same keying scheme as hpDraft, for the same reorder/duplicate
  // reasons.
  const [amountDraft, setAmountDraft] = useState<{
    name: string;
    index: number;
    value: string;
  } | null>(null);
  const [viewMonster, setViewMonster] = useState<SrdMonster | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  // Auto-roll loot when a monster combatant drops to 0 HP (VEG-301).
  // Session-local DM preference, intentionally not persisted on the encounter.
  const [autoRollLoot, setAutoRollLoot] = useState(false);
  // Count of version-guarded writes (PATCHes and loot POSTs) in flight. A
  // counter, not a boolean: a quick write resolving mid-roll must not drop
  // the lock while the roll POST is still pending. While any write is
  // pending, the loot buttons disable and HP commits bail, so a single user
  // can't fire two writes against the same expectedVersion (the second
  // would always 409 and one write would be dropped).
  const [pendingWrites, setPendingWrites] = useState(0);
  const writePending = pendingWrites > 0;
  const beginWrite = () => setPendingWrites(n => n + 1);
  const endWrite = () => setPendingWrites(n => n - 1);
  // Encounter-wide roll replaces existing drops (backend re-rolls every
  // monster combatant) — confirm before doing that destructively.
  const [confirmBulkRoll, setConfirmBulkRoll] = useState(false);

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
  // Returns the updated encounter so callers can chain follow-up writes
  // (auto-roll on death) off the fresh version; null when the PATCH failed.
  const patchEncounter = async (updates: Partial<Encounter>): Promise<Encounter | null> => {
    if (!encounter) return null;
    beginWrite();
    try {
      const updated = await apiFetch<Encounter>(`/encounters/${encounterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...updates, expectedVersion: encounter.version }),
      });
      setEncounter(updated);
      return updated;
    } catch (err) {
      if (handleEncounterConflict(err)) return null;
      toast.error(err instanceof Error ? err.message : 'Failed to update encounter');
      return null;
    } finally {
      endWrite();
    }
  };

  // Roll loot via the VEG-300 endpoint: every monster combatant, or just
  // `combatantIndex` (an index into `enc.combatants`, NOT the sorted row).
  // `enc` is explicit rather than read from state so a caller chaining off a
  // fresh PATCH response can't race React's state update and guard on a stale
  // version.
  const rollLoot = async (
    enc: Encounter,
    combatantIndex: number | undefined,
    successMsg: string
  ) => {
    beginWrite();
    try {
      const { encounter: updated } = await apiFetch<{
        encounter: Encounter;
        lootTotal: EncounterLootTotal;
      }>(`/encounters/${encounterId}/loot`, {
        method: 'POST',
        body: JSON.stringify({
          ...(combatantIndex !== undefined && { combatantIndex }),
          expectedVersion: enc.version,
        }),
      });
      setEncounter(updated);
      toast.success(successMsg);
    } catch (err) {
      if (handleEncounterConflict(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to roll loot');
    } finally {
      endWrite();
    }
  };

  // The single on-death hook (VEG-301): every HP-lowering path must funnel
  // its post-write 0-crossing through here, so future damage/heal controls
  // (VEG-286) inherit auto-roll instead of re-implementing the guards.
  // Only fires on the 0-crossing of a monster-linked combatant with no drop
  // yet — never silently replaces an existing roll. `index` must address
  // `updated.combatants`.
  const maybeAutoRollLootOnDeath = async (
    updated: Encounter,
    target: Combatant,
    index: number,
    newHp: number
  ) => {
    if (!autoRollLoot || newHp !== 0 || target.hp <= 0 || !target.monsterId || target.loot) return;
    await rollLoot(updated, index, `Rolled loot for ${target.name}`);
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
  const commitCombatantHp = async (name: string) => {
    if (!encounter || !hpDraft || hpDraft.name !== name) return;
    const { index: draftIndex, value } = hpDraft;
    setHpDraft(null);
    // A write is already in flight — the commit would race its version guard
    // and one of the two writes would 409. Revert the draft instead (the
    // same silent-revert convention as empty/invalid drafts).
    if (writePending) return;
    const raw = value.trim();
    const parsed = Number(raw);
    if (raw === '' || Number.isNaN(parsed)) return;
    const sorted = sortByInitiative(encounter.combatants);
    const matches = sorted.flatMap((c, idx) => (c.name === name ? [idx] : []));
    const index =
      matches.length === 1 ? matches[0] : sorted[draftIndex]?.name === name ? draftIndex : -1;
    if (index === -1) return;
    const target = sorted[index];
    const clamped = Math.max(0, Math.min(parsed, target.maxHp));
    if (clamped === target.hp) return;
    sorted[index] = { ...target, hp: clamped };
    const updated = await patchEncounter({ combatants: sorted });
    // The PATCH persisted `sorted` verbatim, so `index` is also the
    // combatant's position in the updated combatants array.
    if (updated) {
      await maybeAutoRollLootOnDeath(updated, target, index, clamped);
    }
  };

  // Apply the drafted amount as damage, healing, or a temp HP grant (VEG-286).
  // Damage spends temp HP before real HP; heal clamps to maxHp; temp grants
  // take the higher value (5e non-stacking) — all via the pure helpers.
  // Target resolution mirrors commitCombatantHp: a unique name binds to its
  // (possibly re-sorted) row, a duplicated one only to the row it was typed in.
  // No-op results (lower temp grant, damaging a 0-HP combatant) just clear the
  // draft instead of sending an empty PATCH.
  const applyHpAction = async (
    kind: 'damage' | 'heal' | 'temp',
    name: string,
    rowIndex: number
  ) => {
    if (!encounter || writePending) return;
    if (!amountDraft || amountDraft.name !== name) return;
    const amount = parseAmount(amountDraft.value);
    if (amount === null) return;
    const sorted = sortByInitiative(encounter.combatants);
    const matches = sorted.flatMap((c, idx) => (c.name === name ? [idx] : []));
    const index =
      matches.length === 1 ? matches[0] : sorted[rowIndex]?.name === name ? rowIndex : -1;
    if (index === -1) return;
    const target = sorted[index];
    const next: Combatant =
      kind === 'damage'
        ? { ...target, ...applyDamage(target, amount) }
        : kind === 'heal'
          ? { ...target, ...applyHeal(target, amount) }
          : { ...target, tempHp: grantTempHp(target, amount) };
    if (next.hp === target.hp && (next.tempHp ?? 0) === (target.tempHp ?? 0)) {
      setAmountDraft(null);
      return;
    }
    sorted[index] = next;
    const updated = await patchEncounter({ combatants: sorted });
    if (updated) {
      setAmountDraft(null);
      // The PATCH persisted `sorted` verbatim, so `index` also addresses the
      // updated combatants array (same invariant as commitCombatantHp).
      if (kind === 'damage') await maybeAutoRollLootOnDeath(updated, target, index, next.hp);
    }
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
    beginWrite();
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
    } finally {
      endWrite();
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
  const hasMonsterCombatants = encounter.combatants.some(c => c.monsterId);
  const rolledDropCount = encounter.combatants.filter(c => c.loot).length;
  // Derived fresh from the combatants (same pure helper the backend uses), so
  // the total can never drift from the per-monster drops it sums.
  const lootTotal = encounter.combatants.some(c => c.loot)
    ? aggregateCombatantLoot(encounter.combatants)
    : null;
  // Mirror of the commit-target rule: a unique draft name binds to its (possibly
  // re-sorted) row; a duplicated one binds only to the exact row it was typed in.
  const draftNameIsUnique =
    hpDraft !== null && sorted.filter(c => c.name === hpDraft.name).length === 1;
  const rowHoldsDraft = (c: Combatant, i: number) =>
    hpDraft?.name === c.name && (draftNameIsUnique || hpDraft.index === i);
  const amountNameIsUnique =
    amountDraft !== null && sorted.filter(c => c.name === amountDraft.name).length === 1;
  const rowHoldsAmount = (c: Combatant, i: number) =>
    amountDraft?.name === c.name && (amountNameIsUnique || amountDraft.index === i);

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
          // The roll endpoint addresses combatants by their position in the
          // stored array, not the sorted row. `sorted` shares object
          // references with `encounter.combatants`, so identity lookup maps
          // row → array index even with duplicate names.
          const arrayIndex = encounter.combatants.indexOf(c);
          return (
            <div
              key={`${c.name}-${i}`}
              className={`p-4 rounded-lg border transition-colors ${
                isCurrent
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700'
                  : isDead
                    ? 'bg-red-50/50 dark:bg-red-900/10 border-gray-200 dark:border-gray-700'
                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}
            >
              {/* Dimming applies to the stats line only — the drop view below
                  must stay legible, since dead monsters are exactly the ones
                  whose loot the DM reads out. */}
              <div
                className={`flex items-center gap-4${isDead && !isCurrent ? ' opacity-60' : ''}`}
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
                {isController && c.monsterId && !c.loot && (
                  <button
                    type="button"
                    aria-label={`Roll loot for ${c.name}`}
                    onClick={() => rollLoot(encounter, arrayIndex, `Rolled loot for ${c.name}`)}
                    disabled={writePending}
                    className={lootButtonClass}
                  >
                    Roll loot
                  </button>
                )}
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Init</div>
                    <div className="font-mono font-medium text-gray-900 dark:text-white">
                      {c.initiative}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">AC</div>
                    <div className="font-mono font-medium text-gray-900 dark:text-white">
                      {c.ac}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">HP</div>
                    {isController ? (
                      <input
                        type="number"
                        aria-label={`HP for ${c.name}`}
                        value={rowHoldsDraft(c, i) ? hpDraft!.value : c.hp}
                        onChange={e =>
                          setHpDraft({ name: c.name, index: i, value: e.target.value })
                        }
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
                  {(c.tempHp ?? 0) > 0 && (
                    <div
                      className="text-xs font-mono font-medium text-sky-600 dark:text-sky-400"
                      title="Temporary HP"
                    >
                      +{c.tempHp} temp
                    </div>
                  )}
                </div>
              </div>
              {/* Damage / heal / temp HP controls (VEG-286). The raw HP input
                  above stays as the advanced affordance for direct corrections;
                  these are the table-friendly paths. */}
              {isController &&
                (() => {
                  const rowAmount = rowHoldsAmount(c, i) ? parseAmount(amountDraft!.value) : null;
                  const actionsDisabled = writePending || rowAmount === null;
                  return (
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Amount"
                        aria-label={`Damage or heal amount for ${c.name}`}
                        value={rowHoldsAmount(c, i) ? amountDraft!.value : ''}
                        onChange={e =>
                          setAmountDraft({ name: c.name, index: i, value: e.target.value })
                        }
                        className="w-20 px-2 py-1 text-xs text-center font-mono border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        aria-label={`Damage ${c.name}`}
                        onClick={() => applyHpAction('damage', c.name, i)}
                        disabled={actionsDisabled}
                        className={`${smallButtonBase} text-red-700 dark:text-red-400`}
                      >
                        Damage
                      </button>
                      <button
                        type="button"
                        aria-label={`Heal ${c.name}`}
                        onClick={() => applyHpAction('heal', c.name, i)}
                        disabled={actionsDisabled}
                        className={`${smallButtonBase} text-emerald-700 dark:text-emerald-400`}
                      >
                        Heal
                      </button>
                      <button
                        type="button"
                        aria-label={`Grant temp HP to ${c.name}`}
                        onClick={() => applyHpAction('temp', c.name, i)}
                        disabled={actionsDisabled}
                        className={`${smallButtonBase} text-sky-700 dark:text-sky-400`}
                      >
                        Temp HP
                      </button>
                    </div>
                  );
                })()}
              {/* DM-only drop view (VEG-301) — the player reveal is a separate ticket. */}
              {isController && c.loot && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-start justify-between gap-2 text-sm">
                  <LootDisplay coinage={c.loot.coinage} items={c.loot.items} />
                  <button
                    type="button"
                    aria-label={`Reroll loot for ${c.name}`}
                    onClick={() => rollLoot(encounter, arrayIndex, `Re-rolled loot for ${c.name}`)}
                    disabled={writePending}
                    className={lootButtonClass}
                  >
                    Reroll
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isController && (
        <div className="mt-6 p-4 rounded-lg border bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Encounter loot</h2>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={autoRollLoot}
                  onChange={e => setAutoRollLoot(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                />
                Auto-roll loot on death
              </label>
              <button
                type="button"
                onClick={() => {
                  // Rolling the whole encounter replaces existing drops on the
                  // backend — confirm before clobbering anything already rolled.
                  if (rolledDropCount > 0) setConfirmBulkRoll(true);
                  else rollLoot(encounter, undefined, 'Rolled loot for the encounter');
                }}
                disabled={!hasMonsterCombatants || writePending}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Roll loot for encounter
              </button>
            </div>
          </div>
          {lootTotal ? (
            <div className="mt-3 text-sm">
              <LootDisplay coinage={lootTotal.coinage} items={lootTotal.items} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No loot rolled yet.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmBulkRoll}
        onOpenChange={setConfirmBulkRoll}
        title="Reroll existing loot?"
        description={`Rolling loot for the encounter will replace the ${rolledDropCount} drop${
          rolledDropCount === 1 ? '' : 's'
        } already rolled.`}
        confirmLabel="Roll all"
        onConfirm={() => rollLoot(encounter, undefined, 'Rolled loot for the encounter')}
      />

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
