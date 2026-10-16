import type { Combatant } from '@/lib/types';

// The single ordering rule for the tracker — render, turn order, and HP
// commits must all agree on it. Returns a shallow copy: the elements keep
// their identity with the input array, which the loot index mapping below
// relies on (sorted row → stored-array index via indexOf).
// Ties: Array.prototype.sort is stable, so equal initiatives keep their
// stored-array order. That stored order IS the tiebreak (VEG-285) — every
// write path persists the sorted array, and the up/down reorder controls
// edit it directly — so tie order is deterministic and user-controlled.
export const sortByInitiative = (combatants: Combatant[]) =>
  [...combatants].sort((a, b) => b.initiative - a.initiative);

// A damage/heal/temp amount must be a positive whole number; anything else
// (empty, 0, decimals, text) keeps the action buttons disabled.
export const parseAmount = (value: string): number | null => {
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
export const resolveCombatantRow = (
  sorted: Combatant[],
  name: string,
  rowIndex: number
): number => {
  const matches = sorted.flatMap((c, idx) => (c.name === name ? [idx] : []));
  return matches.length === 1 ? matches[0] : sorted[rowIndex]?.name === name ? rowIndex : -1;
};
