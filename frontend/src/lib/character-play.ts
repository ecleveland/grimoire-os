import type { HitPoints, HitDice, DeathSaves, SpellSlot, Character } from '@/lib/types';
import { applyDamage, applyHeal } from './combatant-hp';

/**
 * Pure state transitions for the in-sheet play controls (VEG-349). The sheet
 * components mutate only *stored* character state through these helpers; derived
 * values (DCs, attack bonuses, modifiers) stay owned by the computed-stats
 * layer. Clamp rules live here so the UI and tests share one source of truth.
 *
 * HP arithmetic reuses the encounter tracker's `combatant-hp` helpers
 * (VEG-286) via a field-name adapter — the `Combatant` shape uses
 * `hp/maxHp/tempHp` while a character's `HitPoints` uses `current/max/temporary`.
 */

/** Damage: temp HP absorbs first, then current; current floors at 0. */
export function damageHitPoints(hp: HitPoints, amount: number): HitPoints {
  const { hp: current, tempHp } = applyDamage({ hp: hp.current, tempHp: hp.temporary }, amount);
  return { ...hp, current, temporary: tempHp };
}

/** Heal: raises current, clamped to max. Temp HP is never healed. */
export function healHitPoints(hp: HitPoints, amount: number): HitPoints {
  const { hp: current } = applyHeal({ hp: hp.current, maxHp: hp.max }, amount);
  return { ...hp, current };
}

/**
 * Set temporary HP to an explicit value (clamped to a non-negative integer).
 * Unlike the encounter tracker's non-stacking `grantTempHp`, the sheet's "Set
 * Temp" action is a direct set — the player enters the value granted to them,
 * not a competing source to reconcile.
 */
export function setTempHitPoints(hp: HitPoints, amount: number): HitPoints {
  return { ...hp, temporary: Math.max(0, Math.floor(amount)) };
}

/** A zeroed death-save track — what a revive above 0 HP resets to. */
export const CLEARED_DEATH_SAVES = { successes: 0, failures: 0 } as const;

/**
 * Death saves only apply while a PC is down: reviving above 0 HP clears them
 * (5e). Mirrors the encounter tracker's `clearDeathSavesIfRevived`
 * (`lib/death-saves.ts`) rule, but for the character sheet's zeroed-object
 * shape (the sheet always renders `deathSaves`, so it resets to 0/0 rather than
 * deleting the field). Returns the cleared track when a heal lands the PC above
 * 0 with saves on the sheet, else `null` (nothing to change).
 */
export function deathSavesAfterRevive(nextCurrent: number, saves: DeathSaves): DeathSaves | null {
  const hasSaves = saves.successes > 0 || saves.failures > 0;
  return nextCurrent > 0 && hasSaves ? { ...CLEARED_DEATH_SAVES } : null;
}

/**
 * Parse a numeric form field to a non-negative integer (blank/NaN → 0). Shared
 * by the HP-amount and coin inputs so the "reject negatives, floor to int"
 * decision lives in one place. (Distinct from `parseIntField`, which truncates
 * but allows negatives, used by the encounter dialogs.)
 */
export function parseNonNegativeInt(value: string): number {
  return Math.max(0, Math.floor(Number(value) || 0));
}

/**
 * Toggle a pip track to `index`. Clicking the highest filled pip clears it
 * (count = index); clicking any other pip fills up to and including it
 * (count = index + 1). Clamped to `0..max`. Shared by death saves (max 3) and
 * spell slots (max = slot total).
 */
export function togglePip(current: number, index: number, max: number): number {
  const next = index + 1 === current ? index : index + 1;
  return Math.max(0, Math.min(max, next));
}

/** Adjust hit dice spent by `delta` (+1 spend, -1 restore); clamped to 0..total. */
export function adjustHitDiceSpent(hitDice: HitDice, delta: number): HitDice {
  return { ...hitDice, spent: Math.max(0, Math.min(hitDice.total, hitDice.spent + delta)) };
}

/**
 * Number of spent hit dice a long rest restores: half your total, rounded down,
 * but never fewer than one (5e PHB "minimum of one die"). The actual restore is
 * still capped by how many were spent — see `applyLongRest`.
 */
export function hitDiceRegainedOnLongRest(total: number): number {
  return Math.max(1, Math.floor(total / 2));
}

/**
 * The single composite write a long rest produces (VEG-407), structurally a
 * `CharacterPatch` so it flows straight through `useCharacterMutation`. `hitDice`
 * and `spellSlots` are omitted when the character has none, so a non-caster or a
 * hit-dice-less sheet doesn't get spurious empty-array/undefined writes.
 */
export interface LongRestPatch {
  hitPoints: HitPoints;
  deathSaves: DeathSaves;
  hitDice?: HitDice;
  spellSlots?: SpellSlot[];
}

/**
 * Long rest (5e): HP to max, temp HP cleared, every spell slot reset to
 * `used: 0`, spent hit dice regained up to half total (rounded down, min 1,
 * capped at spent), and death saves cleared. Composes the per-field rules so the
 * UI and tests share one source of truth — the sheet just dispatches the result.
 */
export function applyLongRest(
  character: Pick<Character, 'hitPoints' | 'spellSlots' | 'hitDice'>
): LongRestPatch {
  const { hitPoints, spellSlots, hitDice } = character;
  const patch: LongRestPatch = {
    hitPoints: { ...hitPoints, current: hitPoints.max, temporary: 0 },
    deathSaves: { ...CLEARED_DEATH_SAVES },
  };
  if (hitDice) {
    const regained = hitDiceRegainedOnLongRest(hitDice.total);
    patch.hitDice = { ...hitDice, spent: Math.max(0, hitDice.spent - regained) };
  }
  if (spellSlots.length > 0) {
    patch.spellSlots = spellSlots.map(slot => ({ ...slot, used: 0 }));
  }
  return patch;
}
