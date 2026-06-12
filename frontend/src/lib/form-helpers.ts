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
