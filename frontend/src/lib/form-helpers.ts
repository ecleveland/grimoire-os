/**
 * Shared helpers for the homebrew form-mapping libs
 * (monster/spell/feat/item-form).
 *
 * `optionalText` encodes the VEG-316 clearing rule once: a blank optional
 * field serializes as `null` (not `undefined` — JSON.stringify drops undefined
 * keys, which would make a PATCH silently keep the old value).
 */
export function optionalText(input: string): string | null {
  return input.trim() || null;
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
