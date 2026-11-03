import type { CharacterClass } from '@grimoire-os/shared';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const stringOrNull = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * Bring a stored character row from before characters held a list of classes
 * into the current shape, the same fold the `character_classes_array` migration
 * applied to live rows. Snapshots keep the row as it was captured, so every read
 * of one passes through here first.
 *
 * `class`, `classId` and `subclass` become a one-entry `classes`, or an empty
 * list when the class is null or empty, and the three keys are dropped. The
 * entry level is the row level floored at one. A single hit-dice object becomes
 * a one-pool array; null stays null. A row that already carries `classes` is
 * returned as it is. Returns a new object otherwise and leaves `data` untouched.
 */
export function foldLegacyCharacterRow(data: Record<string, unknown>): Record<string, unknown> {
  if ('classes' in data) return data;

  const { class: name, classId, subclass, ...rest } = data;
  const classes: CharacterClass[] =
    typeof name === 'string' && name !== ''
      ? [
          {
            classId: stringOrNull(classId),
            name,
            level: Math.max(1, typeof data.level === 'number' ? data.level : 1),
            subclass: stringOrNull(subclass),
            subclassId: null,
          },
        ]
      : [];

  const folded: Record<string, unknown> = { ...rest, classes };
  if (isRecord(rest.hitDice)) folded.hitDice = [rest.hitDice];
  return folded;
}
