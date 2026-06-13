import type { Combatant, DeathSaves } from '@/lib/types';

/**
 * Pure death-saving-throw logic for the encounter tracker (VEG-288). The UI
 * and tests share these rules so the "3 successes stabilize / 3 failures kill /
 * heal clears" semantics live in one place.
 */

export const DEATH_SAVE_MAX = 3;

export type DeathSaveStatus = 'dying' | 'stable' | 'dead';

/** A downed PC carries death saves: a non-NPC combatant at 0 HP. */
export function showsDeathSaves(combatant: Pick<Combatant, 'isNpc' | 'hp'>): boolean {
  return !combatant.isNpc && combatant.hp <= 0;
}

/** Absent saves read as 0/0; three failures kill, three successes stabilize. */
export function deathSaveStatus(saves: DeathSaves | undefined): DeathSaveStatus {
  if ((saves?.failures ?? 0) >= DEATH_SAVE_MAX) return 'dead';
  if ((saves?.successes ?? 0) >= DEATH_SAVE_MAX) return 'stable';
  return 'dying';
}

/** Increment one tally, capped at 3. Absent saves start from 0/0. */
export function markDeathSave(
  saves: DeathSaves | undefined,
  kind: 'success' | 'failure'
): DeathSaves {
  const next: DeathSaves = {
    successes: saves?.successes ?? 0,
    failures: saves?.failures ?? 0,
  };
  if (kind === 'success') next.successes = Math.min(DEATH_SAVE_MAX, next.successes + 1);
  else next.failures = Math.min(DEATH_SAVE_MAX, next.failures + 1);
  return next;
}

/**
 * Death saves only apply while a PC is down: reviving above 0 HP clears them.
 * A no-op when there are no saves or the combatant is still at/below 0, so it's
 * safe to run on every HP mutation.
 */
export function clearDeathSavesIfRevived(combatant: Combatant): Combatant {
  if (combatant.hp > 0 && combatant.deathSaves) {
    const next = { ...combatant };
    delete next.deathSaves;
    return next;
  }
  return combatant;
}
