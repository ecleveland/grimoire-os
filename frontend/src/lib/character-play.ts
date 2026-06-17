import type { HitPoints, HitDice } from '@/lib/types';
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

/** Death/spell-slot pip toggle: cleared death saves on every revive above 0. */
export const CLEARED_DEATH_SAVES = { successes: 0, failures: 0 } as const;

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
