/** The character and level a new character was copied from. */
export interface CopiedFrom {
  name: string;
  level: number;
}

function storageKey(characterId: string): string {
  return `copied-from:${characterId}`;
}

/**
 * Leaves a note for the next sheet load of `characterId` saying which
 * character and level it was copied from. The note is session-only on
 * purpose: nothing about the origin is persisted on the character, so it
 * shows once after the copy and never again. Storage that is unavailable or
 * full drops the note quietly, because it is a courtesy line and the copy
 * itself already succeeded.
 */
export function rememberCopiedFrom(characterId: string, origin: CopiedFrom): void {
  try {
    sessionStorage.setItem(storageKey(characterId), JSON.stringify(origin));
  } catch {
    // No note this time. See the doc comment.
  }
}

function isCopiedFrom(value: unknown): value is CopiedFrom {
  if (typeof value !== 'object' || value === null) return false;
  const { name, level } = value as Record<string, unknown>;
  return typeof name === 'string' && typeof level === 'number';
}

/**
 * Reads and removes the note `rememberCopiedFrom` left for `characterId`.
 * Returns null when there is none, when it does not parse to the expected
 * shape, or when storage throws, which includes a server render where
 * `sessionStorage` does not exist.
 */
export function takeCopiedFrom(characterId: string): CopiedFrom | null {
  try {
    const key = storageKey(characterId);
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    sessionStorage.removeItem(key);
    const parsed: unknown = JSON.parse(raw);
    return isCopiedFrom(parsed) ? { name: parsed.name, level: parsed.level } : null;
  } catch {
    return null;
  }
}
