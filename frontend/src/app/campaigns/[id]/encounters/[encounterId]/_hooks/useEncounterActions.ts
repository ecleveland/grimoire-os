'use client';

import { toast } from 'sonner';
import type { Combatant, Encounter, SrdMonster } from '@/lib/types';
import type { AddToEncounterResult } from '@/components/AddToEncounterDialog';
import {
  buildManualCombatant,
  buildMonsterCombatants,
  buildPartyCombatants,
  dexModifier,
  rollInitiativeMod,
} from '@/lib/encounter-combatants';
import type { ManualCombatantInput, PartyCombatantEntry } from '@/lib/encounter-combatants';
import { applyDamage, applyHeal, grantTempHp } from '@/lib/combatant-hp';
import { concentrationFromSpellInput, toggleConditionInList } from '@/lib/character-play';
import { markDeathSave } from '@/lib/death-saves';
import { xpForCr } from '@grimoire-os/shared';
import type { Condition } from '@grimoire-os/shared';
import { parseAmount, resolveCombatantRow, sortByInitiative } from './encounter-rows';
import type { UseEncounterResult } from './useEncounter';

export interface EncounterActions {
  nextTurn: () => void;
  previousTurn: () => void;
  toggleActive: () => void;
  commitCombatantHp: (name: string, rowIndex: number, value: string) => Promise<void>;
  applyHpAction: (
    kind: 'damage' | 'heal' | 'temp',
    name: string,
    rowIndex: number,
    raw: string
  ) => Promise<boolean>;
  commitCombatantInitiative: (name: string, rowIndex: number, value: string) => Promise<void>;
  moveCombatant: (name: string, rowIndex: number, dir: 'up' | 'down') => Promise<void>;
  appendCombatants: (
    additions: Combatant[],
    opts: { successMsg: string; errorMsg: string }
  ) => Promise<boolean>;
  addMonsterToEncounter: (monster: SrdMonster, result: AddToEncounterResult) => Promise<void>;
  addManualCombatant: (input: ManualCombatantInput) => Promise<boolean>;
  addPartyToEncounter: (entries: PartyCombatantEntry[]) => Promise<boolean>;
  linkMonsterToCombatant: (
    target: { name: string; index: number },
    monster: SrdMonster
  ) => Promise<'done' | 'missing' | 'failed'>;
  unlinkCombatant: (name: string, rowIndex: number) => Promise<void>;
  toggleCondition: (name: string, rowIndex: number, condition: Condition) => Promise<void>;
  toggleConcentration: (name: string, rowIndex: number) => Promise<void>;
  commitConcentrationSpell: (name: string, rowIndex: number, value: string) => Promise<void>;
  commitCombatantNotes: (name: string, rowIndex: number, value: string) => Promise<void>;
  setExhaustion: (name: string, rowIndex: number, level: number) => Promise<void>;
  markDeathSaveOnRow: (
    name: string,
    rowIndex: number,
    kind: 'success' | 'failure'
  ) => Promise<void>;
  resetDeathSaves: (name: string, rowIndex: number) => Promise<void>;
  removeCombatant: (name: string, rowIndex: number) => Promise<void>;
  clearAllCombatants: () => Promise<void>;
  rollNpcInitiatives: (mode: 'each' | 'shared') => Promise<void>;
  maybeAutoRollLootOnDeath: (
    updated: Encounter,
    target: Combatant,
    index: number,
    newHp: number
  ) => Promise<void>;
}

/**
 * The tracker's domain writes. Every action resolves its target row through
 * resolveCombatantRow and writes through `io.patch` or `io.rollLoot`, so the
 * version guard and the write lock apply to all of them.
 */
export function useEncounterActions(
  encounter: Encounter | null,
  io: Pick<UseEncounterResult, 'patch' | 'rollLoot' | 'writePending'>,
  autoRollLoot: boolean
): EncounterActions {
  const { patch: patchEncounter, rollLoot, writePending } = io;

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

  // Step back through the initiative order (VEG-289), mirroring nextTurn:
  // wrapping past the top rolls the round back. Clamped at the very start
  // (round 1, turn 0) so the tracker can't reverse before the encounter began.
  const previousTurn = () => {
    if (!encounter) return;
    if (encounter.round === 1 && encounter.currentTurn === 0) return;
    const sorted = sortByInitiative(encounter.combatants);
    const activeCombatants = sorted.filter(c => c.hp > 0);
    if (activeCombatants.length === 0) return;

    let prevIndex = encounter.currentTurn - 1;
    let newRound = encounter.round;
    if (prevIndex < 0) {
      prevIndex = sorted.length - 1;
      newRound -= 1;
    }
    // Clamp the upper bound too, so a stale out-of-range marker can't persist a
    // still-invalid index — nextTurn self-heals via its wrap, this mirrors that.
    patchEncounter({ currentTurn: Math.min(prevIndex, sorted.length - 1), round: newRound });
  };

  // Commit the drafted HP: one clamped, version-guarded PATCH. Empty/invalid
  // or unchanged drafts revert silently; fractional entries floor (HP is
  // always a whole number). Targeting goes through resolveCombatantRow, and a
  // combatant removed mid-edit bails out.
  const commitCombatantHp = async (name: string, rowIndex: number, value: string) => {
    if (!encounter) return;
    // A write is already in flight — the commit would race its version guard
    // and one of the two writes would 409. Revert the draft instead (the
    // same silent-revert convention as empty/invalid drafts).
    if (writePending) return;
    const raw = value.trim();
    const parsed = Number(raw);
    if (raw === '' || Number.isNaN(parsed)) return;
    const sorted = sortByInitiative(encounter.combatants);
    const index = resolveCombatantRow(sorted, name, rowIndex);
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
  const commitCombatantInitiative = async (name: string, rowIndex: number, value: string) => {
    if (!encounter) return;
    if (writePending) return;
    const raw = value.trim();
    const parsed = Number(raw);
    if (raw === '' || !Number.isFinite(parsed)) return;
    const next = Math.trunc(parsed);
    const sorted = sortByInitiative(encounter.combatants);
    const index = resolveCombatantRow(sorted, name, rowIndex);
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
  // Resolves true when the caller should clear its amount draft: on a no-op and
  // once the PATCH lands. The auto-roll that a lethal hit may start runs on
  // after that, under the write lock.
  const applyHpAction = async (
    kind: 'damage' | 'heal' | 'temp',
    name: string,
    rowIndex: number,
    raw: string
  ): Promise<boolean> => {
    if (!encounter || writePending) return false;
    const amount = parseAmount(raw);
    if (amount === null) return false;
    const sorted = sortByInitiative(encounter.combatants);
    const index = resolveCombatantRow(sorted, name, rowIndex);
    if (index === -1) return false;
    const target = sorted[index];
    const next: Combatant =
      kind === 'damage'
        ? { ...target, ...applyDamage(target, amount) }
        : kind === 'heal'
          ? { ...target, ...applyHeal(target, amount) }
          : { ...target, tempHp: grantTempHp(target, amount) };
    if (next.hp === target.hp && (next.tempHp ?? 0) === (target.tempHp ?? 0)) return true;
    // patchEncounter clears death saves when this lands above 0 HP (VEG-288).
    sorted[index] = next;
    const updated = await patchEncounter({ combatants: sorted });
    if (!updated) return false;
    // The PATCH persisted `sorted` verbatim, so `index` also addresses the
    // updated combatants array (same invariant as commitCombatantHp).
    if (kind === 'damage') void maybeAutoRollLootOnDeath(updated, target, index, next.hp);
    return true;
  };

  const toggleActive = () => {
    if (!encounter) return;
    patchEncounter({ isActive: !encounter.isActive });
  };

  // The one version-guarded append shared by all three add paths (monster
  // lookup, manual form, party picker): PATCH with expectedVersion, the shared
  // 409 recovery, per-path toasts. Resolves true on success so the
  // originating dialog closes; a conflict keeps it open and the user's entry
  // survives the refetch for a retry.
  const appendCombatants = async (
    additions: Combatant[],
    opts: { successMsg: string; errorMsg: string }
  ): Promise<boolean> => {
    if (!encounter || additions.length === 0) return false;
    // currentTurn indexes the sorted rows, so an addition that sorts above the
    // active row would otherwise shift the highlight to a different combatant.
    // Re-anchor by the active combatant's identity (same pattern as the
    // initiative-edit / reorder / remove paths). Omit currentTurn when unchanged.
    const combatants = [...encounter.combatants, ...additions];
    const active = sortByInitiative(encounter.combatants)[encounter.currentTurn];
    const newTurn = active ? sortByInitiative(combatants).indexOf(active) : encounter.currentTurn;
    const updated = await patchEncounter(
      {
        combatants,
        ...(newTurn !== encounter.currentTurn && { currentTurn: newTurn }),
      },
      { errorMessage: opts.errorMsg }
    );
    if (!updated) return false;
    toast.success(opts.successMsg);
    return true;
  };

  // Append monster combatant(s) from the lookup panel (VEG-260).
  const addMonsterToEncounter = async (
    monster: SrdMonster,
    { quantity, initiatives }: AddToEncounterResult
  ): Promise<void> => {
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
  const addManualCombatant = async (input: ManualCombatantInput): Promise<boolean> => {
    if (!encounter) return false;
    const combatant = buildManualCombatant(
      input,
      encounter.combatants.map(c => c.name)
    );
    return appendCombatants([combatant], {
      successMsg: `Added ${combatant.name} to the encounter`,
      errorMsg: 'Failed to add combatant',
    });
  };

  // Append the selected PCs (VEG-283). The empty-entries guard backstops the
  // dialog's disabled confirm — onConfirm is a public prop boundary.
  const addPartyToEncounter = async (entries: PartyCombatantEntry[]): Promise<boolean> => {
    if (!encounter || entries.length === 0) return false;
    const additions = buildPartyCombatants(
      entries,
      encounter.combatants.map(c => c.name)
    );
    return appendCombatants(additions, {
      successMsg:
        additions.length > 1
          ? `Added ${additions.length} party members to the encounter`
          : `Added ${additions[0].name} to the encounter`,
      errorMsg: 'Failed to add party',
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
  // 'missing' and 'done' close the picker; 'failed' keeps it open.
  const linkMonsterToCombatant = async (
    target: { name: string; index: number },
    monster: SrdMonster
  ): Promise<'done' | 'missing' | 'failed'> => {
    const result = await mutateCombatantRow(target.name, target.index, c => ({
      ...c,
      monsterId: monster.id,
      cr: monster.challengeRating,
      xp: monster.experiencePoints ?? xpForCr(monster.challengeRating),
      initiativeMod: dexModifier(monster),
    }));
    if (result === 'missing') {
      toast.error('That combatant is no longer in the encounter.');
      return 'missing';
    }
    // On failure (incl. 409) the picker stays open so the DM can retry
    // against the refreshed encounter.
    if (!result) return 'failed';
    toast.success(`Linked ${target.name} to ${monster.name}`);
    return 'done';
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
      const next = toggleConditionInList(c.conditions ?? [], condition);
      const updated = { ...c };
      if (next.length > 0) updated.conditions = next;
      else delete updated.conditions;
      return updated;
    });
  };

  // Toggle concentration (VEG-287): start with no spell named, or stop and
  // drop the key. The card clears its spell draft once this resolves.
  const toggleConcentration = async (name: string, rowIndex: number) => {
    await mutateCombatantRow(name, rowIndex, c => {
      const updated = { ...c };
      if (c.concentration) delete updated.concentration;
      else updated.concentration = {};
      return updated;
    });
  };

  // Commit the concentration-spell draft (VEG-287). No-op unless the row is
  // still concentrating; an empty spell drops the name but keeps concentration.
  const commitConcentrationSpell = async (name: string, rowIndex: number, value: string) => {
    const next = concentrationFromSpellInput(value);
    await mutateCombatantRow(name, rowIndex, c =>
      c.concentration ? { ...c, concentration: next } : c
    );
  };

  // Commit the drafted combatant notes (VEG-289): trim and persist, dropping the
  // key entirely when emptied (absent means no notes). The card calls this only
  // when it holds a draft, so a focus/blur without a change never fires a PATCH.
  const commitCombatantNotes = async (name: string, rowIndex: number, value: string) => {
    const notes = value.trim();
    await mutateCombatantRow(name, rowIndex, c => {
      const next = { ...c };
      if (notes) next.notes = notes;
      else delete next.notes;
      return next;
    });
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

  return {
    nextTurn,
    previousTurn,
    toggleActive,
    commitCombatantHp,
    applyHpAction,
    commitCombatantInitiative,
    moveCombatant,
    appendCombatants,
    addMonsterToEncounter,
    addManualCombatant,
    addPartyToEncounter,
    linkMonsterToCombatant,
    unlinkCombatant,
    toggleCondition,
    toggleConcentration,
    commitConcentrationSpell,
    commitCombatantNotes,
    setExhaustion,
    markDeathSaveOnRow,
    resetDeathSaves,
    removeCombatant,
    clearAllCombatants,
    rollNpcInitiatives,
    maybeAutoRollLootOnDeath,
  };
}
