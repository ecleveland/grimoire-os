'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';
import type { Combatant, Encounter, PartyCharacter, SrdMonster } from '@/lib/types';
import Badge from '@/components/Badge';
import Modal from '@/components/Modal';
import MonsterStatBlock from '@/components/MonsterStatBlock';
import MonsterLookupPanel from '@/components/MonsterLookupPanel';
import AddCombatantDialog from '@/components/AddCombatantDialog';
import EncounterDifficulty from '@/components/EncounterDifficulty';
import AddPartyDialog from '@/components/AddPartyDialog';
import LinkMonsterDialog from '@/components/LinkMonsterDialog';
import {
  buildManualCombatant,
  buildMonsterCombatants,
  buildPartyCombatants,
  dexModifier,
  rollInitiativeMod,
} from '@/lib/encounter-combatants';
import type { ManualCombatantInput, PartyCombatantEntry } from '@/lib/encounter-combatants';
import { applyDamage, applyHeal, grantTempHp } from '@/lib/combatant-hp';
import {
  clearDeathSavesIfRevived,
  deathSaveStatus,
  markDeathSave,
  showsDeathSaves,
  DEATH_SAVE_MAX,
} from '@/lib/death-saves';
import type { AddToEncounterResult } from '@/components/AddToEncounterDialog';
import { aggregateCombatantLoot, CONDITIONS, xpForCr } from '@grimoire-os/shared';
import type {
  CombatantLootCoinage,
  CombatantLootItem,
  Condition,
  EncounterLootTotal,
} from '@grimoire-os/shared';
import ConfirmDialog from '@/components/ConfirmDialog';
import { formatCoinage } from '@/lib/coinage';

// The single ordering rule for the tracker — render, turn order, and HP
// commits must all agree on it. Returns a shallow copy: the elements keep
// their identity with the input array, which the loot index mapping below
// relies on (sorted row → stored-array index via indexOf).
// Ties: Array.prototype.sort is stable, so equal initiatives keep their
// stored-array order. That stored order IS the tiebreak (VEG-285) — every
// write path persists the sorted array, and the up/down reorder controls
// edit it directly — so tie order is deterministic and user-controlled.
const sortByInitiative = (combatants: Combatant[]) =>
  [...combatants].sort((a, b) => b.initiative - a.initiative);

const smallButtonBase =
  'shrink-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const lootButtonClass = `${smallButtonBase} text-gray-700 dark:text-gray-300`;
const statusSelectClass =
  'shrink-0 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500 disabled:opacity-50';

// A damage/heal/temp amount must be a positive whole number; anything else
// (empty, 0, decimals, text) keeps the action buttons disabled.
const parseAmount = (value: string): number | null => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return parsed > 0 ? parsed : null;
};

// Resolve which sorted row a draft targets: a unique name binds to its
// (possibly re-sorted) row; a duplicated name binds only to the exact row the
// draft was typed in, and -1 means the target is gone (bail out). Every
// combatant-mutating path must use this one rule so drafts can't land on the
// wrong twin.
const resolveCombatantRow = (sorted: Combatant[], name: string, rowIndex: number): number => {
  const matches = sorted.flatMap((c, idx) => (c.name === name ? [idx] : []));
  return matches.length === 1 ? matches[0] : sorted[rowIndex]?.name === name ? rowIndex : -1;
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
  const { id: campaignId, encounterId } = useParams<{ id: string; encounterId: string }>();
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
  // In-progress initiative edit (VEG-285), committed on blur/Enter. Same
  // keying scheme as hpDraft.
  const [initDraft, setInitDraft] = useState<{ name: string; index: number; value: string } | null>(
    null
  );
  // In-progress concentration-spell edit (VEG-287), committed on blur/Enter.
  // Same keying scheme as hpDraft.
  const [concDraft, setConcDraft] = useState<{ name: string; index: number; value: string } | null>(
    null
  );
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
  // Manual add-combatant form (VEG-282).
  const [addCombatantOpen, setAddCombatantOpen] = useState(false);
  // Party picker (VEG-283). `partyRoster` is null while the fetch is in flight.
  const [addPartyOpen, setAddPartyOpen] = useState(false);
  const [partyRoster, setPartyRoster] = useState<PartyCharacter[] | null>(null);
  // Link-monster picker (VEG-328): which unlinked row is being linked. Keyed
  // by name + sorted-row index, the same identity scheme as the HP drafts.
  const [linkTarget, setLinkTarget] = useState<{ name: string; index: number } | null>(null);
  // Remove-combatant confirm (VEG-284): which row is pending removal. Same
  // name + sorted-row-index identity as the drafts and the link picker.
  const [removeTarget, setRemoveTarget] = useState<{ name: string; index: number } | null>(null);
  // Clear-all confirm (VEG-284).
  const [confirmClearAll, setConfirmClearAll] = useState(false);

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
      // Enforce the death-save invariant at the one write chokepoint (VEG-288):
      // any combatant being persisted above 0 HP must not carry death saves, so
      // no current or future HP path can leave a revived PC showing stale pips.
      const normalized = updates.combatants
        ? { ...updates, combatants: updates.combatants.map(clearDeathSavesIfRevived) }
        : updates;
      const updated = await apiFetch<Encounter>(`/encounters/${encounterId}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...normalized, expectedVersion: encounter.version }),
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
  // or unchanged drafts revert silently; fractional entries floor (HP is
  // always a whole number). Targeting goes through resolveCombatantRow, and a
  // combatant removed mid-edit bails out.
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
    const index = resolveCombatantRow(sorted, name, draftIndex);
    if (index === -1) return;
    const target = sorted[index];
    const clamped = Math.max(0, Math.min(Math.floor(parsed), target.maxHp));
    if (clamped === target.hp) return;
    // patchEncounter clears death saves when this lands above 0 HP (VEG-288).
    sorted[index] = { ...target, hp: clamped };
    const updated = await patchEncounter({ combatants: sorted });
    // The PATCH persisted `sorted` verbatim, so `index` is also the
    // combatant's position in the updated combatants array.
    if (updated) {
      await maybeAutoRollLootOnDeath(updated, target, index, clamped);
    }
  };

  // Commit the drafted initiative (VEG-285): one version-guarded PATCH that
  // persists the re-sorted list. `currentTurn` indexes the sorted order, so
  // the same PATCH moves the pointer with the active combatant's identity —
  // the turn marker must never jump to whoever re-sorted into its row.
  // Empty, non-numeric, or unchanged drafts revert silently (the hpDraft
  // convention); fractional entries truncate, negatives are allowed (a Dex
  // penalty can roll below 0).
  const commitCombatantInitiative = async (name: string) => {
    if (!encounter || !initDraft || initDraft.name !== name) return;
    const { index: draftIndex, value } = initDraft;
    setInitDraft(null);
    if (writePending) return;
    const raw = value.trim();
    const parsed = Number(raw);
    if (raw === '' || !Number.isFinite(parsed)) return;
    const next = Math.trunc(parsed);
    const sorted = sortByInitiative(encounter.combatants);
    const index = resolveCombatantRow(sorted, name, draftIndex);
    if (index === -1) return;
    const target = sorted[index];
    if (next === target.initiative) return;
    const active = sorted[encounter.currentTurn];
    const updatedTarget = { ...target, initiative: next };
    sorted[index] = updatedTarget;
    const resorted = sortByInitiative(sorted);
    // If the edited combatant held the turn, follow its replacement object.
    const tracked = active === target ? updatedTarget : active;
    const newTurn = tracked ? resorted.indexOf(tracked) : encounter.currentTurn;
    await patchEncounter({
      combatants: resorted,
      ...(newTurn !== encounter.currentTurn && { currentTurn: newTurn }),
    });
  };

  // Swap a combatant with its equal-initiative neighbor (VEG-285). Stored
  // order is the sort tiebreak, so persisting the swapped array IS the
  // reorder; the equal-initiative guard keeps the array sorted. currentTurn
  // follows the active combatant's identity across the swap.
  const moveCombatant = async (name: string, rowIndex: number, dir: 'up' | 'down') => {
    if (!encounter || writePending) return;
    const sorted = sortByInitiative(encounter.combatants);
    const index = resolveCombatantRow(sorted, name, rowIndex);
    if (index === -1) return;
    const neighbor = dir === 'up' ? index - 1 : index + 1;
    if (
      neighbor < 0 ||
      neighbor >= sorted.length ||
      sorted[neighbor].initiative !== sorted[index].initiative
    )
      return;
    const active = sorted[encounter.currentTurn];
    [sorted[index], sorted[neighbor]] = [sorted[neighbor], sorted[index]];
    const newTurn = active ? sorted.indexOf(active) : encounter.currentTurn;
    await patchEncounter({
      combatants: sorted,
      ...(newTurn !== encounter.currentTurn && { currentTurn: newTurn }),
    });
  };

  // Apply the drafted amount as damage, healing, or a temp HP grant (VEG-286).
  // Damage spends temp HP before real HP; heal clamps to maxHp; temp grants
  // take the higher value (5e non-stacking) — all via the pure helpers.
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
    const index = resolveCombatantRow(sorted, name, rowIndex);
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
    // patchEncounter clears death saves when this lands above 0 HP (VEG-288).
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

  // The one version-guarded append shared by all three add paths (monster
  // lookup, manual form, party picker): PATCH with expectedVersion, the shared
  // 409 recovery, per-path toasts. `onSuccess` closes the originating dialog —
  // only on success, so a conflict keeps it open and the user's entry survives
  // the refetch for a retry. Kept separate from patchEncounter for the
  // add-specific toasts.
  const appendCombatants = async (
    additions: Combatant[],
    opts: { successMsg: string; errorMsg: string; onSuccess?: () => void }
  ) => {
    if (!encounter || additions.length === 0) return;
    // currentTurn indexes the sorted rows, so an addition that sorts above the
    // active row would otherwise shift the highlight to a different combatant.
    // Re-anchor by the active combatant's identity (same pattern as the
    // initiative-edit / reorder / remove paths). Omit currentTurn when unchanged.
    const combatants = [...encounter.combatants, ...additions];
    const active = sortByInitiative(encounter.combatants)[encounter.currentTurn];
    const newTurn = active ? sortByInitiative(combatants).indexOf(active) : encounter.currentTurn;
    beginWrite();
    try {
      const updated = await apiFetch<Encounter>(`/encounters/${encounterId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          combatants,
          ...(newTurn !== encounter.currentTurn && { currentTurn: newTurn }),
          expectedVersion: encounter.version,
        }),
      });
      setEncounter(updated);
      opts.onSuccess?.();
      toast.success(opts.successMsg);
    } catch (err) {
      if (handleEncounterConflict(err)) return;
      toast.error(err instanceof Error ? err.message : opts.errorMsg);
    } finally {
      endWrite();
    }
  };

  // Append monster combatant(s) from the lookup panel (VEG-260).
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
    await appendCombatants(additions, {
      successMsg:
        quantity > 1
          ? `Added ${quantity} ${monster.name}s to the encounter`
          : `Added ${monster.name} to the encounter`,
      errorMsg: 'Failed to add to encounter',
    });
  };

  // Append a hand-entered combatant (VEG-282).
  const addManualCombatant = async (input: ManualCombatantInput) => {
    if (!encounter) return;
    const combatant = buildManualCombatant(
      input,
      encounter.combatants.map(c => c.name)
    );
    await appendCombatants([combatant], {
      successMsg: `Added ${combatant.name} to the encounter`,
      errorMsg: 'Failed to add combatant',
      onSuccess: () => setAddCombatantOpen(false),
    });
  };

  // Open the party picker and fetch the campaign roster (VEG-283). Mirrors the
  // stat-block viewer's open-then-load pattern: the modal opens immediately
  // with a loading state, and a failed fetch toasts and closes it.
  const openAddParty = () => {
    setPartyRoster(null);
    setAddPartyOpen(true);
    apiFetch<PartyCharacter[]>(`/campaigns/${campaignId}/characters`)
      .then(setPartyRoster)
      .catch(() => {
        toast.error('Failed to load party');
        setAddPartyOpen(false);
      });
  };

  // Append the selected PCs (VEG-283). The empty-entries guard backstops the
  // dialog's disabled confirm — onConfirm is a public prop boundary.
  const addPartyToEncounter = async (entries: PartyCombatantEntry[]) => {
    if (!encounter || entries.length === 0) return;
    const additions = buildPartyCombatants(
      entries,
      encounter.combatants.map(c => c.name)
    );
    await appendCombatants(additions, {
      successMsg:
        additions.length > 1
          ? `Added ${additions.length} party members to the encounter`
          : `Added ${additions[0].name} to the encounter`,
      errorMsg: 'Failed to add party',
      onSuccess: () => setAddPartyOpen(false),
    });
  };

  // Apply `mutate` to one row, addressed by the shared name + sorted-row-index
  // identity, and persist the result. The single home for the row-resolution
  // rules of the link/unlink paths (VEG-328): 'missing' means the row is gone
  // (duplicate-name ambiguity or removal), null means the write was skipped or
  // failed (patchEncounter already toasted).
  const mutateCombatantRow = async (
    name: string,
    rowIndex: number,
    mutate: (c: Combatant) => Combatant
  ): Promise<Encounter | 'missing' | null> => {
    if (!encounter || writePending) return null;
    const sorted = sortByInitiative(encounter.combatants);
    const index = resolveCombatantRow(sorted, name, rowIndex);
    if (index === -1) return 'missing';
    sorted[index] = mutate(sorted[index]);
    return patchEncounter({ combatants: sorted });
  };

  // Link an unlinked row to a monster (VEG-328). Leaves the DM's
  // possibly-customized name/HP/AC alone, but does snapshot the stat block's
  // cr/xp (VEG-362) so the linked row counts toward encounter difficulty.
  const linkMonsterToCombatant = async (monster: SrdMonster) => {
    if (!linkTarget) return;
    const result = await mutateCombatantRow(linkTarget.name, linkTarget.index, c => ({
      ...c,
      monsterId: monster.id,
      cr: monster.challengeRating,
      xp: monster.experiencePoints ?? xpForCr(monster.challengeRating),
      initiativeMod: dexModifier(monster),
    }));
    if (result === 'missing') {
      toast.error('That combatant is no longer in the encounter.');
      setLinkTarget(null);
      return;
    }
    // On failure (incl. 409) the picker stays open so the DM can retry
    // against the refreshed encounter.
    if (result) {
      toast.success(`Linked ${linkTarget.name} to ${monster.name}`);
      setLinkTarget(null);
    }
  };

  // Remove a mislink (VEG-328): drops only the monsterId key. Any rolled loot
  // stays on the row (it already dropped); the Reroll control disappears with
  // the linkage.
  const unlinkCombatant = async (name: string, rowIndex: number) => {
    const result = await mutateCombatantRow(name, rowIndex, c => {
      const next = { ...c };
      delete next.monsterId;
      // Drop the snapshotted stat-block numbers too, so an unlinked row stops
      // counting toward difficulty (VEG-362) and reverts to a flat d20 on the
      // NPC initiative roll (VEG-370) — matching how it loses Reroll.
      delete next.cr;
      delete next.xp;
      delete next.initiativeMod;
      return next;
    });
    if (result && result !== 'missing') toast.success(`Unlinked ${name}`);
  };

  // Toggle an SRD condition on a row (VEG-287). One handler serves both the
  // add select and the chip's remove ×: present → drop it, absent → append.
  // The key is deleted when the list empties so cleared rows stay minimal.
  const toggleCondition = async (name: string, rowIndex: number, condition: Condition) => {
    await mutateCombatantRow(name, rowIndex, c => {
      const current = c.conditions ?? [];
      const next = current.includes(condition)
        ? current.filter(x => x !== condition)
        : [...current, condition];
      const updated = { ...c };
      if (next.length > 0) updated.conditions = next;
      else delete updated.conditions;
      return updated;
    });
  };

  // Toggle concentration (VEG-287): start with no spell named, or stop and
  // drop the key (and any in-progress spell draft for the row).
  const toggleConcentration = async (name: string, rowIndex: number) => {
    await mutateCombatantRow(name, rowIndex, c => {
      const updated = { ...c };
      if (c.concentration) delete updated.concentration;
      else updated.concentration = {};
      return updated;
    });
    setConcDraft(null);
  };

  // Commit the concentration-spell draft (VEG-287). No-op unless the row is
  // still concentrating; an empty spell drops the name but keeps concentration.
  const commitConcentrationSpell = async (name: string) => {
    if (!concDraft || concDraft.name !== name) return;
    const spell = concDraft.value.trim();
    setConcDraft(null);
    await mutateCombatantRow(name, concDraft.index, c =>
      c.concentration ? { ...c, concentration: spell ? { spell } : {} } : c
    );
  };

  // Set or clear exhaustion (VEG-287). Levels 1–6 persist; 0 (or out of range)
  // drops the key, mirroring "absent means none".
  const setExhaustion = async (name: string, rowIndex: number, level: number) => {
    await mutateCombatantRow(name, rowIndex, c => {
      const updated = { ...c };
      if (level >= 1 && level <= 6) updated.exhaustion = level;
      else delete updated.exhaustion;
      return updated;
    });
  };

  // Mark a death-saving throw on a downed PC (VEG-288); counts cap at 3 (the
  // pure helper handles the absent-saves 0/0 start and the cap).
  const markDeathSaveOnRow = async (
    name: string,
    rowIndex: number,
    kind: 'success' | 'failure'
  ) => {
    await mutateCombatantRow(name, rowIndex, c => ({
      ...c,
      deathSaves: markDeathSave(c.deathSaves, kind),
    }));
  };

  // Clear a PC's death saves (VEG-288) — e.g. after a misclick. Healing above
  // 0 also clears them automatically, but a stabilized/dead tally needs a way
  // back to a clean slate without a heal.
  const resetDeathSaves = async (name: string, rowIndex: number) => {
    await mutateCombatantRow(name, rowIndex, c => {
      const next = { ...c };
      delete next.deathSaves;
      return next;
    });
  };

  // Remove one combatant (VEG-284). Persists the filtered array and, when the
  // removal pushes currentTurn past the end of the list, re-clamps it in the
  // same PATCH so the turn pointer can never address a missing row.
  const removeCombatant = async (name: string, rowIndex: number) => {
    if (!encounter || writePending) return;
    const sorted = sortByInitiative(encounter.combatants);
    const index = resolveCombatantRow(sorted, name, rowIndex);
    if (index === -1) {
      toast.error('That combatant is no longer in the encounter.');
      return;
    }
    sorted.splice(index, 1);
    const clampedTurn = Math.max(0, Math.min(encounter.currentTurn, sorted.length - 1));
    const updated = await patchEncounter({
      combatants: sorted,
      ...(clampedTurn !== encounter.currentTurn && { currentTurn: clampedTurn }),
    });
    if (updated) toast.success(`Removed ${name}`);
  };

  // Reset the board (VEG-284): drop every combatant and rewind the tracker.
  const clearAllCombatants = async () => {
    if (!encounter || writePending) return;
    const updated = await patchEncounter({ combatants: [], currentTurn: 0, round: 1 });
    if (updated) toast.success('Cleared all combatants');
  };

  // Roll initiative for every NPC at once (VEG-370), overwriting their current
  // values; PCs roll their own and are left untouched. 'each' rolls an
  // independent d20 + the snapshotted DEX modifier per NPC (flat d20 when a row
  // has no modifier — hand-typed NPCs and pre-VEG-370 rows); 'shared' rolls a
  // single flat d20 and applies it to all NPCs (group initiative). One
  // version-guarded PATCH; currentTurn re-anchors to the active combatant's
  // identity so the turn marker can't jump (same rule as the per-row edit).
  const rollNpcInitiatives = async (mode: 'each' | 'shared') => {
    if (!encounter || writePending) return;
    if (!encounter.combatants.some(c => c.isNpc)) return;
    // Shared mode rolls one d20 up front and gives it to every NPC; each mode
    // rolls per NPC (d20 + its snapshotted modifier, flat d20 when absent).
    // rollInitiativeMod never returns < 1, so `?? rollPerNpc` only falls through
    // in each mode (sharedRoll is null there).
    const sharedRoll = mode === 'shared' ? rollInitiativeMod(0) : null;
    const combatants = encounter.combatants.map(c =>
      c.isNpc ? { ...c, initiative: sharedRoll ?? rollInitiativeMod(c.initiativeMod ?? 0) } : c
    );
    // Follow the active combatant across the re-sort: a PC keeps its object
    // reference; an NPC was replaced, so map to its new object by stored index.
    const active = sortByInitiative(encounter.combatants)[encounter.currentTurn];
    const activeNext = active
      ? active.isNpc
        ? combatants[encounter.combatants.indexOf(active)]
        : active
      : undefined;
    const newTurn = activeNext
      ? sortByInitiative(combatants).indexOf(activeNext)
      : encounter.currentTurn;
    const updated = await patchEncounter({
      combatants,
      ...(newTurn !== encounter.currentTurn && { currentTurn: newTurn }),
    });
    if (updated) {
      toast.success(
        mode === 'shared' ? 'Rolled one initiative for all NPCs' : 'Rolled NPC initiatives'
      );
    }
  };

  const viewCombatantMonster = (monsterId: string) => {
    setViewMonster(null);
    setViewLoading(true);
    setViewOpen(true);
    apiFetch<SrdMonster | null>(`/srd/monsters/${monsterId}`)
      .then(monster => {
        // 200 null = outside the viewer's visibility (e.g. a player clicking
        // the DM's homebrew-linked combatant, or a deleted monster) — close
        // with a toast instead of sticking on "Loading monster…".
        if (!monster) {
          toast.error('This stat block is not available to you');
          setViewOpen(false);
          return;
        }
        setViewMonster(monster);
      })
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
  // Render-side mirror of resolveCombatantRow: a unique draft name binds to
  // its (possibly re-sorted) row; a duplicated one binds only to the exact row
  // it was typed in. One factory serves both drafts so the binding rule can't
  // drift between them.
  const makeRowHoldsDraft = (draft: { name: string; index: number } | null) => {
    const nameIsUnique = draft !== null && sorted.filter(c => c.name === draft.name).length === 1;
    return (c: Combatant, i: number) =>
      draft?.name === c.name && (nameIsUnique || draft.index === i);
  };
  const rowHoldsDraft = makeRowHoldsDraft(hpDraft);
  const rowHoldsAmount = makeRowHoldsDraft(amountDraft);
  const rowHoldsInit = makeRowHoldsDraft(initDraft);
  const rowHoldsConc = makeRowHoldsDraft(concDraft);

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

      {/* Encounter difficulty (VEG-362): DM-planning info, controller-only like
          the loot panel. Monsters drive XP/CR; the PCs in the encounter set the
          2024 budget. */}
      {isController && (
        <div className="mb-4">
          <EncounterDifficulty combatants={encounter.combatants} />
        </div>
      )}

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
                <div className="flex items-center gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-xs text-gray-500 dark:text-gray-400">Init</div>
                    {isController ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Initiative for ${c.name}`}
                        value={rowHoldsInit(c, i) ? initDraft!.value : c.initiative}
                        onChange={e =>
                          setInitDraft({ name: c.name, index: i, value: e.target.value })
                        }
                        onBlur={() => commitCombatantInitiative(c.name)}
                        onKeyDown={e => {
                          // Enter commits via the blur handler — a single commit
                          // path, so it can't double-PATCH with a stale draft.
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                        className="w-14 px-1 py-0.5 text-center font-mono font-medium border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    ) : (
                      <div className="font-mono font-medium text-gray-900 dark:text-white">
                        {c.initiative}
                      </div>
                    )}
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
              {/* Status chips (VEG-287): conditions, concentration, and
                  exhaustion — shown to everyone. Controllers get a remove ×
                  on each condition; the add/toggle controls render below. */}
              {((c.conditions?.length ?? 0) > 0 || c.concentration || (c.exhaustion ?? 0) > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {(c.conditions ?? []).map(cond => (
                    <span
                      key={cond}
                      className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded"
                    >
                      {cond}
                      {isController && (
                        <button
                          type="button"
                          aria-label={`Remove ${cond} from ${c.name}`}
                          onClick={() => toggleCondition(c.name, i, cond)}
                          disabled={writePending}
                          className="hover:text-purple-900 dark:hover:text-purple-100 disabled:opacity-50"
                        >
                          &times;
                        </button>
                      )}
                    </span>
                  ))}
                  {c.concentration && (
                    <span
                      className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded"
                      title="Concentration"
                    >
                      Concentrating{c.concentration.spell ? `: ${c.concentration.spell}` : ''}
                    </span>
                  )}
                  {(c.exhaustion ?? 0) > 0 && (
                    <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                      Exhaustion {c.exhaustion}
                    </span>
                  )}
                </div>
              )}
              {/* Death saves (VEG-288): only for a downed PC. Pips + status are
                  shown to everyone; the mark/reset controls are controller-only
                  and lock once the tally resolves to stable or dead. */}
              {showsDeathSaves(c) &&
                (() => {
                  const status = deathSaveStatus(c.deathSaves);
                  const successes = c.deathSaves?.successes ?? 0;
                  const failures = c.deathSaves?.failures ?? 0;
                  const pips = (filled: number, tone: string) =>
                    Array.from({ length: DEATH_SAVE_MAX }, (_, k) => (
                      <span
                        key={k}
                        className={`inline-block w-2.5 h-2.5 rounded-full border ${
                          k < filled ? tone : 'border-gray-300 dark:border-gray-600'
                        }`}
                      />
                    ));
                  return (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Death Saves
                      </span>
                      <span
                        className="inline-flex items-center gap-1"
                        aria-label={`Death save successes for ${c.name}: ${successes} of ${DEATH_SAVE_MAX}`}
                      >
                        {pips(successes, 'bg-emerald-500 border-emerald-500')}
                      </span>
                      <span
                        className="inline-flex items-center gap-1"
                        aria-label={`Death save failures for ${c.name}: ${failures} of ${DEATH_SAVE_MAX}`}
                      >
                        {pips(failures, 'bg-red-500 border-red-500')}
                      </span>
                      {status === 'stable' && (
                        <span className="text-xs px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded">
                          Stable
                        </span>
                      )}
                      {status === 'dead' && (
                        <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                          Dead
                        </span>
                      )}
                      {isController && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Mark death save success for ${c.name}`}
                            onClick={() => markDeathSaveOnRow(c.name, i, 'success')}
                            disabled={writePending}
                            className={`${smallButtonBase} text-emerald-700 dark:text-emerald-400`}
                          >
                            + Success
                          </button>
                          <button
                            type="button"
                            aria-label={`Mark death save failure for ${c.name}`}
                            onClick={() => markDeathSaveOnRow(c.name, i, 'failure')}
                            disabled={writePending}
                            className={`${smallButtonBase} text-red-700 dark:text-red-400`}
                          >
                            + Failure
                          </button>
                          {c.deathSaves && (
                            <button
                              type="button"
                              aria-label={`Reset death saves for ${c.name}`}
                              onClick={() => resetDeathSaves(c.name, i)}
                              disabled={writePending}
                              className={lootButtonClass}
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              {/* Row management (left) + damage/heal/temp HP controls (right,
                  VEG-286). The raw HP input above stays as the advanced
                  affordance for direct corrections; these are the
                  table-friendly paths. */}
              {isController &&
                (() => {
                  const rowAmount = rowHoldsAmount(c, i) ? parseAmount(amountDraft!.value) : null;
                  const actionsDisabled = writePending || rowAmount === null;
                  return (
                    <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        {/* Manual tiebreak (VEG-285): swap with the adjacent
                            row, offered only inside a tie group. */}
                        {i > 0 && sorted[i - 1].initiative === c.initiative && (
                          <button
                            type="button"
                            aria-label={`Move ${c.name} up`}
                            onClick={() => moveCombatant(c.name, i, 'up')}
                            disabled={writePending}
                            className={lootButtonClass}
                          >
                            &uarr;
                          </button>
                        )}
                        {i < sorted.length - 1 && sorted[i + 1].initiative === c.initiative && (
                          <button
                            type="button"
                            aria-label={`Move ${c.name} down`}
                            onClick={() => moveCombatant(c.name, i, 'down')}
                            disabled={writePending}
                            className={lootButtonClass}
                          >
                            &darr;
                          </button>
                        )}
                        {/* Link / unlink the stat-block reference (VEG-328). */}
                        {!c.monsterId && (
                          <button
                            type="button"
                            aria-label={`Link monster for ${c.name}`}
                            onClick={() => setLinkTarget({ name: c.name, index: i })}
                            disabled={writePending}
                            className={lootButtonClass}
                          >
                            Link monster
                          </button>
                        )}
                        {c.monsterId && (
                          <button
                            type="button"
                            aria-label={`Unlink monster from ${c.name}`}
                            onClick={() => unlinkCombatant(c.name, i)}
                            disabled={writePending}
                            className={lootButtonClass}
                          >
                            Unlink
                          </button>
                        )}
                        {c.monsterId && !c.loot && (
                          <button
                            type="button"
                            aria-label={`Roll loot for ${c.name}`}
                            onClick={() =>
                              rollLoot(encounter, arrayIndex, `Rolled loot for ${c.name}`)
                            }
                            disabled={writePending}
                            className={lootButtonClass}
                          >
                            Roll loot
                          </button>
                        )}
                        {/* Remove the row (VEG-284) — confirmed via dialog below. */}
                        <button
                          type="button"
                          aria-label={`Remove ${c.name}`}
                          onClick={() => setRemoveTarget({ name: c.name, index: i })}
                          disabled={writePending}
                          className={`${smallButtonBase} text-red-700 dark:text-red-400`}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
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
                    </div>
                  );
                })()}
              {/* Status editing (VEG-287): add a condition, toggle/name a
                  concentration spell, set exhaustion. Controller-only; the
                  read-only chips above are shown to everyone. */}
              {isController && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    aria-label={`Add condition to ${c.name}`}
                    value=""
                    onChange={e => {
                      if (e.target.value) toggleCondition(c.name, i, e.target.value as Condition);
                    }}
                    disabled={writePending}
                    className={statusSelectClass}
                  >
                    <option value="">+ Condition</option>
                    {CONDITIONS.filter(cond => !(c.conditions ?? []).includes(cond)).map(cond => (
                      <option key={cond} value={cond}>
                        {cond}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Toggle concentration for ${c.name}`}
                    onClick={() => toggleConcentration(c.name, i)}
                    disabled={writePending}
                    className={lootButtonClass}
                  >
                    {c.concentration ? 'Stop concentrating' : 'Concentrate'}
                  </button>
                  {c.concentration && (
                    <input
                      type="text"
                      placeholder="Spell"
                      aria-label={`Concentration spell for ${c.name}`}
                      value={rowHoldsConc(c, i) ? concDraft!.value : (c.concentration.spell ?? '')}
                      onChange={e =>
                        setConcDraft({ name: c.name, index: i, value: e.target.value })
                      }
                      onBlur={() => commitConcentrationSpell(c.name)}
                      onKeyDown={e => {
                        // Enter commits via the blur handler — one commit path.
                        if (e.key === 'Enter') e.currentTarget.blur();
                      }}
                      className="w-28 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  )}
                  <select
                    aria-label={`Exhaustion for ${c.name}`}
                    value={c.exhaustion ?? 0}
                    onChange={e => setExhaustion(c.name, i, Number(e.target.value))}
                    disabled={writePending}
                    className={statusSelectClass}
                  >
                    <option value={0}>Exhaustion: none</option>
                    {[1, 2, 3, 4, 5, 6].map(n => (
                      <option key={n} value={n}>
                        Exhaustion {n}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {/* DM-only drop view (VEG-301) — the player reveal is a separate ticket. */}
              {isController && c.loot && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-start justify-between gap-2 text-sm">
                  <LootDisplay coinage={c.loot.coinage} items={c.loot.items} />
                  {/* Rerolling needs the monster reference; an unlinked row
                      (VEG-328) keeps its drop readable but can't reroll. */}
                  {c.monsterId && (
                    <button
                      type="button"
                      aria-label={`Reroll loot for ${c.name}`}
                      onClick={() =>
                        rollLoot(encounter, arrayIndex, `Re-rolled loot for ${c.name}`)
                      }
                      disabled={writePending}
                      className={lootButtonClass}
                    >
                      Reroll
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isController && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAddCombatantOpen(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            Add combatant
          </button>
          <button
            type="button"
            onClick={openAddParty}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            Add party
          </button>
          {/* Roll initiative for every NPC at once (VEG-370): "Each" rolls per-NPC
              d20 + DEX mod; "Shared" rolls one d20 for the whole group. */}
          {encounter.combatants.some(c => c.isNpc) && (
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-500 dark:text-gray-400">Roll NPC init:</span>
              <button
                type="button"
                aria-label="Roll initiative for each NPC"
                onClick={() => rollNpcInitiatives('each')}
                disabled={writePending}
                className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Each
              </button>
              <button
                type="button"
                aria-label="Roll one shared initiative for all NPCs"
                onClick={() => rollNpcInitiatives('shared')}
                disabled={writePending}
                className="px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Shared
              </button>
            </div>
          )}
          {encounter.combatants.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearAll(true)}
              disabled={writePending}
              className="ml-auto px-3 py-1.5 text-sm border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-700 dark:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}

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
        open={removeTarget !== null}
        onOpenChange={open => {
          if (!open) setRemoveTarget(null);
        }}
        title="Remove combatant?"
        description={`Remove ${removeTarget?.name ?? ''} from the encounter? Their HP and any rolled loot are discarded.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (removeTarget) removeCombatant(removeTarget.name, removeTarget.index);
        }}
      />

      <ConfirmDialog
        open={confirmClearAll}
        onOpenChange={setConfirmClearAll}
        title="Clear all combatants?"
        description="This removes every combatant from the tracker and resets it to round 1."
        confirmLabel="Clear all"
        onConfirm={clearAllCombatants}
      />

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

      <Modal
        open={addCombatantOpen}
        onClose={() => setAddCombatantOpen(false)}
        label="Add combatant"
      >
        <AddCombatantDialog
          onConfirm={addManualCombatant}
          onCancel={() => setAddCombatantOpen(false)}
          submitting={writePending}
        />
      </Modal>

      <Modal open={linkTarget !== null} onClose={() => setLinkTarget(null)} label="Link monster">
        {linkTarget && (
          <LinkMonsterDialog
            combatantName={linkTarget.name}
            onSelect={linkMonsterToCombatant}
            onCancel={() => setLinkTarget(null)}
            submitting={writePending}
          />
        )}
      </Modal>

      <Modal open={addPartyOpen} onClose={() => setAddPartyOpen(false)} label="Add party">
        {partyRoster === null ? (
          <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Loading party…
          </p>
        ) : (
          <AddPartyDialog
            characters={partyRoster}
            existingNames={encounter.combatants.map(c => c.name)}
            onConfirm={addPartyToEncounter}
            onCancel={() => setAddPartyOpen(false)}
            submitting={writePending}
          />
        )}
      </Modal>

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
