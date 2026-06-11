import type { LootRange } from '@grimoire-os/shared';

// Shared semantics for the loot-template range editors (VEG-303): bounds are
// integers ≥ floor; a transiently crossed range is allowed while typing and
// resolved on blur in favor of the bound the user touched last.

/** Parses one bound; null means "not a number yet — don't commit". */
export function parseBound(raw: string, floor: number): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(floor, Math.floor(n));
}

export function setBound(range: LootRange, bound: 'min' | 'max', value: number): LootRange {
  return bound === 'min' ? [value, range[1]] : [range[0], value];
}

/** Resolves a crossed range toward the bound the user edited last. */
export function normalizeRange(range: LootRange, lastEdited: 'min' | 'max'): LootRange {
  if (range[0] <= range[1]) return range;
  return lastEdited === 'min' ? [range[0], range[0]] : [range[1], range[1]];
}
