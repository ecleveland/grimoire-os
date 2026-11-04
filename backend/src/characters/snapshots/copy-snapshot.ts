import { SNAPSHOT_OMITTED_COLUMNS } from './capture-snapshot';
import { isRecord } from '../../common/helpers/json';

const resetUses = (value: unknown) =>
  Array.isArray(value) ? value.map((entry: object) => ({ ...entry, used: 0 })) : value;

/**
 * Turn a snapshot's stored sheet into the body for a new character.
 *
 * The copy is a fresh character at that level, not one caught mid-fight. So it
 * starts at full hit points with no temporary ones, every hit die in every
 * pool, spell slot and resource use restored, death saves at zero, and no conditions,
 * concentration or exhaustion. A null pool is passed on as null; the create
 * path then seeds pools for every class that resolves to a catalog row, so only
 * a sheet whose classes resolve to none stays without one. Everything else
 * copies as stored.
 *
 * The name defaults to the stored one with the snapshot level appended. The
 * columns a snapshot omits are dropped, in case an older row still carries one.
 * Returns a new object and leaves `data` untouched.
 */
export function buildCopyInput(
  data: Record<string, unknown>,
  level: number,
  name?: string
): Record<string, unknown> {
  const omitted: readonly string[] = SNAPSHOT_OMITTED_COLUMNS;
  const input = Object.fromEntries(Object.entries(data).filter(([key]) => !omitted.includes(key)));
  const { hitPoints, hitDice, deathSaves } = input;

  return {
    ...input,
    name: name ?? `${String(input.name)} (level ${level})`,
    hitPoints: isRecord(hitPoints)
      ? { ...hitPoints, current: hitPoints.max, temporary: 0 }
      : hitPoints,
    hitDice: Array.isArray(hitDice)
      ? hitDice.map((pool: object) => ({ ...pool, spent: 0 }))
      : hitDice,
    deathSaves: isRecord(deathSaves) ? { successes: 0, failures: 0 } : deathSaves,
    spellSlots: resetUses(input.spellSlots),
    resources: resetUses(input.resources),
    conditions: [],
    concentration: null,
    exhaustion: null,
  };
}
