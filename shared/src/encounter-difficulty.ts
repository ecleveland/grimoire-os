import type { Combatant } from './embedded';

/**
 * Encounter-difficulty math (VEG-362), kept in @grimoire-os/shared so the
 * create page, the tracker, and the backend all derive identical numbers.
 *
 * Two source tables, both constants rather than SRD data:
 *  - CR→XP is the Monster Manual challenge-rating XP table.
 *  - XP_BUDGET_PER_CHARACTER is the 2024 DMG "Encounter XP Budget per Character"
 *    table (flat budget per PC level, no encounter-size multiplier — the 2024
 *    rules dropped it).
 */

/** Canonical challenge-rating → XP values (Monster Manual). */
export const CR_XP: Readonly<Record<number, number>> = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10000,
  14: 11500,
  15: 13000,
  16: 15000,
  17: 18000,
  18: 20000,
  19: 22000,
  20: 25000,
  21: 33000,
  22: 41000,
  23: 50000,
  24: 62000,
  25: 75000,
  26: 90000,
  27: 105000,
  28: 120000,
  29: 135000,
  30: 155000,
};

/**
 * XP value for a challenge rating, or 0 for a CR outside the table (a monster's
 * CR is always one of these values, so 0 only ever shows up for bad data).
 */
export function xpForCr(cr: number): number {
  return CR_XP[cr] ?? 0;
}

export interface PartyBudget {
  low: number;
  moderate: number;
  high: number;
}

/**
 * 2024 DMG XP budget per character, indexed by level 1–20. The party's budget
 * for a difficulty is the sum of these values across its characters.
 */
export const XP_BUDGET_PER_CHARACTER: Readonly<Record<number, PartyBudget>> = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1100 },
  6: { low: 600, moderate: 1000, high: 1400 },
  7: { low: 750, moderate: 1300, high: 1700 },
  8: { low: 1000, moderate: 1700, high: 2100 },
  9: { low: 1300, moderate: 2000, high: 2600 },
  10: { low: 1600, moderate: 2300, high: 3100 },
  11: { low: 1900, moderate: 2900, high: 4100 },
  12: { low: 2200, moderate: 3700, high: 4700 },
  13: { low: 2600, moderate: 4200, high: 5400 },
  14: { low: 2900, moderate: 4900, high: 6200 },
  15: { low: 3300, moderate: 5400, high: 7800 },
  16: { low: 3800, moderate: 6100, high: 9800 },
  17: { low: 4500, moderate: 7200, high: 11700 },
  18: { low: 5000, moderate: 8700, high: 14200 },
  19: { low: 5500, moderate: 10700, high: 17200 },
  20: { low: 6400, moderate: 13200, high: 22000 },
};

/** 2024 DMG difficulty tiers, plus a "Deadly" label for over the High budget. */
export type DifficultyBand = 'Low' | 'Moderate' | 'High' | 'Deadly';

/**
 * Monsters-per-PC ratio at/above which we flag action economy. The 2024 XP band
 * ignores how many bodies are on the field, so a swarm of weak monsters can read
 * "Low" while a flood of attacks overwhelms a small party. 3:1 is the point
 * where the extra actions clearly outweigh the XP picture.
 */
export const ACTION_ECONOMY_RATIO = 3;

export interface EncounterSummary {
  /** Number of monster/NPC combatants (`isNpc === true`). */
  monsterCount: number;
  /** Total monster XP (snapshotted `xp`, falling back to the CR→XP table). */
  totalXp: number;
  /** Sum of monster challenge ratings. */
  summedCr: number;
  /** Count of PC combatants carrying a known level. */
  partyCount: number;
  /** Party XP budget per tier, or null when no PC has a level. */
  partyBudget: PartyBudget | null;
  /** Difficulty band vs. the party budget, or null when the budget is null. */
  band: DifficultyBand | null;
  /**
   * True when monsters outnumber the (leveled) PCs by at least
   * ACTION_ECONOMY_RATIO:1 — a signal the XP band alone misses, since the 2024
   * model has no monster-count multiplier. Only meaningful when both counts are
   * > 0.
   */
  actionEconomyWarning: boolean;
}

/**
 * Party XP budget for a set of PC levels (2024 DMG), summing the per-character
 * table across the party. Levels are clamped into the 1–20 table range. Returns
 * null for an empty list so callers can distinguish "no party" from a 0 budget.
 */
export function partyBudget(levels: number[]): PartyBudget | null {
  if (levels.length === 0) return null;
  return levels.reduce<PartyBudget>(
    (acc, level) => {
      const clamped = Math.min(20, Math.max(1, Math.trunc(level)));
      const per = XP_BUDGET_PER_CHARACTER[clamped];
      return {
        low: acc.low + per.low,
        moderate: acc.moderate + per.moderate,
        high: acc.high + per.high,
      };
    },
    { low: 0, moderate: 0, high: 0 }
  );
}

/**
 * A combatant counts toward the monster totals when it carries a stat-block
 * snapshot (`cr`/`xp`) — i.e. it was added from the compendium or linked to a
 * monster. PCs (which carry `level`, not `cr`/`xp`), hand-typed NPCs, and
 * DM-controlled allies/summons have no snapshot and are excluded, so they can't
 * inflate the threat budget. Using the snapshot rather than `isNpc` also keeps
 * a phantom `xpForCr(0)` out of the total for NPCs that have no stat block.
 */
function isMonster(c: Combatant): boolean {
  return c.cr !== undefined || c.xp !== undefined;
}

function bandFor(totalXp: number, budget: PartyBudget): DifficultyBand {
  if (totalXp <= budget.low) return 'Low';
  if (totalXp <= budget.moderate) return 'Moderate';
  if (totalXp <= budget.high) return 'High';
  return 'Deadly';
}

/**
 * Summarize an encounter's combatants into the difficulty readout (VEG-362):
 * monster count, total monster XP and summed CR (only stat-block-snapshotted
 * monsters count, so PCs and allies are excluded — "ignore the active
 * players"), the party budget from the PC levels in the encounter, and the
 * 2024 difficulty band. The band is null until at least one PC carries a level
 * (so the UI can prompt to add the party instead of guessing) AND there is at
 * least one monster — rating an empty board "Low" would mislead any consumer
 * that doesn't replicate a monster-count guard.
 */
export function summarizeEncounter(combatants: Combatant[]): EncounterSummary {
  const monsters = combatants.filter(isMonster);
  const monsterCount = monsters.length;
  const totalXp = monsters.reduce((sum, c) => sum + (c.xp ?? xpForCr(c.cr ?? 0)), 0);
  const summedCr = monsters.reduce((sum, c) => sum + (c.cr ?? 0), 0);

  // A PC is any non-monster carrying a level; level-less combatants (hand-typed
  // PCs) are dropped, biasing the budget smaller — i.e. toward over-stating
  // difficulty, the safe direction.
  const partyLevels = combatants
    .filter(c => !isMonster(c) && typeof c.level === 'number')
    .map(c => c.level as number);
  const budget = partyBudget(partyLevels);

  const partyCount = partyLevels.length;
  return {
    monsterCount,
    totalXp,
    summedCr,
    partyCount,
    partyBudget: budget,
    band: budget && monsterCount > 0 ? bandFor(totalXp, budget) : null,
    actionEconomyWarning:
      monsterCount > 0 && partyCount > 0 && monsterCount >= partyCount * ACTION_ECONOMY_RATIO,
  };
}
