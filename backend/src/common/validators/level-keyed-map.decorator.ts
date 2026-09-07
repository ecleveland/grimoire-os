import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Validators for the character-level-keyed progression tables inside a class's
 * `spellcasting` Json column (VEG-506).
 *
 * These are plain `Record`s rather than nested DTOs, so `@ValidateNested` and
 * the pipe's whitelist cannot see inside them: without these checks the column
 * accepts any JSON at all. A progression table with a string slot count or a
 * level 47 key passes the write, sits in the database, and first fails when a
 * character sheet tries to render spell slots from it — far from the request
 * that caused it. Rejecting at the boundary keeps the failure local.
 *
 * Keys arrive as strings because they are object keys; a numeric literal in
 * JSON becomes `"1"`, which is why every check parses rather than compares.
 */

/** Levels a D&D character can reach; progression tables are keyed by these. */
const MAX_CHARACTER_LEVEL = 20;

/** Generous upper bound on any single count. Guards typos, not game balance. */
const MAX_COUNT = 99;

/** Highest spell slot level in the SRD. */
const MAX_SLOT_LEVEL = 9;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isKeyInRange(key: string, min: number, max: number): boolean {
  // `Number('')` is 0 and `Number(' 1 ')` is 1, so reject anything that does not
  // round-trip: a key must be the plain decimal form of the level it names.
  const parsed = Number(key);
  return Number.isInteger(parsed) && String(parsed) === key && parsed >= min && parsed <= max;
}

/** `{ 1: 2, 2: 3 }` — character level to a single count. */
export function isLevelCountMap(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(
    ([level, count]) =>
      isKeyInRange(level, 1, MAX_CHARACTER_LEVEL) && isIntegerInRange(count, 0, MAX_COUNT)
  );
}

/** `{ 1: { 1: 2 } }` — character level to a slot-level-to-count table. */
export function isSlotProgression(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(([level, slots]) => {
    if (!isKeyInRange(level, 1, MAX_CHARACTER_LEVEL) || !isPlainObject(slots)) return false;
    return Object.entries(slots).every(
      ([slotLevel, count]) =>
        isKeyInRange(slotLevel, 1, MAX_SLOT_LEVEL) && isIntegerInRange(count, 0, MAX_COUNT)
    );
  });
}

/** `{ 1: { slots: 1, slotLevel: 1 } }` — Warlock pact slots per character level. */
export function isPactProgression(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(([level, entry]) => {
    if (!isKeyInRange(level, 1, MAX_CHARACTER_LEVEL) || !isPlainObject(entry)) return false;
    const keys = Object.keys(entry);
    if (keys.length !== 2 || !keys.includes('slots') || !keys.includes('slotLevel')) return false;
    return (
      isIntegerInRange(entry.slots, 0, MAX_COUNT) &&
      isIntegerInRange(entry.slotLevel, 1, MAX_SLOT_LEVEL)
    );
  });
}

type Shape = 'levelCount' | 'slotProgression' | 'pactProgression';

const CHECKS: Record<Shape, { test: (value: unknown) => boolean; describe: string }> = {
  levelCount: {
    test: isLevelCountMap,
    describe: `a map of character level (1-${MAX_CHARACTER_LEVEL}) to a count`,
  },
  slotProgression: {
    test: isSlotProgression,
    describe: `a map of character level (1-${MAX_CHARACTER_LEVEL}) to spell slot level (1-${MAX_SLOT_LEVEL}) to a count`,
  },
  pactProgression: {
    test: isPactProgression,
    describe: `a map of character level (1-${MAX_CHARACTER_LEVEL}) to { slots, slotLevel }`,
  },
};

@ValidatorConstraint({ name: 'isLevelKeyedMap', async: false })
class IsLevelKeyedMapConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args?: { constraints: unknown[] }): boolean {
    const shape = args?.constraints[0] as Shape;
    return CHECKS[shape].test(value);
  }

  defaultMessage(args?: { constraints: unknown[] }): string {
    const shape = args?.constraints[0] as Shape;
    return `$property must be ${CHECKS[shape].describe}`;
  }
}

/**
 * Validate a level-keyed progression table. `shape` selects which of the three
 * layouts the column uses; a name outside the union is a compile error rather
 * than a validator that silently passes everything.
 */
export function IsLevelKeyedMap(shape: Shape, options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      constraints: [shape],
      validator: IsLevelKeyedMapConstraint,
    });
  };
}
