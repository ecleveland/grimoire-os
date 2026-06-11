import type { Combatant } from '@/lib/types';

/**
 * Pure 5e HP arithmetic for the encounter tracker (VEG-286). All helpers
 * ignore non-positive amounts so callers can pass parsed input straight
 * through; clamping rules live here so the UI and tests share one source
 * of truth.
 */

export interface HpAfterDamage {
  hp: number;
  tempHp: number;
}

/** Damage spends temporary HP first, then real HP; real HP floors at 0. */
export function applyDamage(
  combatant: Pick<Combatant, 'hp' | 'tempHp'>,
  amount: number
): HpAfterDamage {
  const tempHp = combatant.tempHp ?? 0;
  if (amount <= 0) return { hp: combatant.hp, tempHp };
  const spentOnTemp = Math.min(tempHp, amount);
  return {
    hp: Math.max(0, combatant.hp - (amount - spentOnTemp)),
    tempHp: tempHp - spentOnTemp,
  };
}

/** Healing raises real HP, clamped to maxHp. Temporary HP is never healed. */
export function applyHeal(
  combatant: Pick<Combatant, 'hp' | 'maxHp'>,
  amount: number
): { hp: number } {
  if (amount <= 0) return { hp: combatant.hp };
  return { hp: Math.min(combatant.maxHp, combatant.hp + amount) };
}

/** Temp HP doesn't stack — a new grant only applies if it's higher (5e). */
export function grantTempHp(combatant: Pick<Combatant, 'tempHp'>, amount: number): number {
  return Math.max(combatant.tempHp ?? 0, amount > 0 ? amount : 0);
}
