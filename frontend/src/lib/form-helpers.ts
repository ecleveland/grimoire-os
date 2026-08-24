/**
 * Shared helpers for turning form-field strings into API payload values. Mostly
 * the homebrew form-mapping libs (monster/spell/feat/item-form), plus the
 * numeric-input helpers at the bottom.
 *
 * `optionalText` encodes the VEG-316 clearing rule once: a blank optional
 * field serializes as `null` (not `undefined` — JSON.stringify drops undefined
 * keys, which would make a PATCH silently keep the old value).
 */
export function optionalText(input: string): string | null {
  return input.trim() || null;
}

/** One entry per line; lines are trimmed and blank lines dropped. */
export function parseLines(input: string): string[] {
  return input
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
}

/** "cold, fire" -> ['cold', 'fire']; blank entries dropped. */
export function parseCommaList(input: string): string[] {
  return input
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/** Integer within [min, max] (max defaults to unbounded); null when not. */
export function parseIntInRange(
  input: string,
  min: number,
  max: number = Number.POSITIVE_INFINITY
): number | null {
  const value = Number(input.trim());
  if (!Number.isInteger(value) || value < min || value > max) return null;
  return value;
}

/**
 * Integer pinned into [min, max]; blank/unparseable input reads as 0 first, and
 * a fractional value floors (the backing columns are Postgres int4, so `Number()`
 * alone waves 30.5 through to an `@IsInt` 400).
 *
 * The clamping counterpart to {@link parseIntInRange}, which *rejects* the same
 * input by returning null. Reach for this one where a control has a bound the
 * server also enforces and the user should never be able to leave the field
 * holding a value the write would refuse (VEG-500); reach for `parseIntInRange`
 * where an out-of-range entry is a validation error to report.
 */
export function clampIntToRange(input: string, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(Number(input) || 0)));
}
