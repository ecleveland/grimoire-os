import type { DeathSaves } from './embedded';

/**
 * Death-save revive rule, shared so the encounter tracker and the
 * character sheet clear the track under the same condition. Tests live in
 * backend/src/common/death-saves.spec.ts.
 */

/** A zeroed death-save track, what a revive above 0 HP resets to. */
export const CLEARED_DEATH_SAVES = { successes: 0, failures: 0 } as const;

/** Whether the track has anything to clear. */
export function hasDeathSaves(saves: DeathSaves): boolean {
  return saves.successes > 0 || saves.failures > 0;
}

/**
 * Death saves only apply while a PC is down, so a heal above 0 HP clears them
 * (5e). Returns a fresh cleared track when `hp` is above 0 and either tally is
 * set, else `null` (nothing to change). Absent saves and an already-empty track
 * both return `null`.
 */
export function reviveDeathSaves(
  hp: number,
  saves: DeathSaves | null | undefined
): DeathSaves | null {
  return hp > 0 && saves && hasDeathSaves(saves) ? { ...CLEARED_DEATH_SAVES } : null;
}
