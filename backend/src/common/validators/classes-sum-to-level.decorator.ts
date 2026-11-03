import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';
import { duplicateClassEntry } from '@grimoire-os/shared';

type LevelledEntry = { level?: unknown };

/**
 * Why a character's class levels disagree with its level, or null when they
 * agree. An empty list agrees with any level, because a character with no class
 * recorded has nothing to check. Shared by the DTO validator below and the
 * service, which checks again against stored values on every write.
 */
export function classLevelMismatch(
  classes: readonly LevelledEntry[],
  level: number
): string | null {
  if (classes.length === 0) return null;
  const sum = classes.reduce(
    (total, entry) => total + (typeof entry.level === 'number' ? entry.level : 0),
    0
  );
  return sum === level ? null : `classes levels sum to ${sum} but level is ${level}`;
}

/**
 * Cross-field rule on `classes`: the entry levels must add up to the sibling
 * `level`. Passes when either field is absent or not yet the right type, so the
 * fields' own validators report those, and when the list is empty.
 */
export function ClassesSumToLevel(options?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'classesSumToLevel',
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const level = (args.object as Record<string, unknown>).level;
          if (!Array.isArray(value) || typeof level !== 'number') return true;
          return classLevelMismatch(value as LevelledEntry[], level) === null;
        },
        defaultMessage(args: ValidationArguments): string {
          const level = (args.object as Record<string, unknown>).level as number;
          return classLevelMismatch(args.value as LevelledEntry[], level) ?? '';
        },
      },
    });
  };
}

/**
 * Rejects a class list that names the same class twice, by trimmed case-folded
 * name or by equal non-null classId. The message names the repeated entry.
 * Entries whose `name` is not a string are left to the nested validation.
 */
export function IsUniqueClassList(options?: ValidationOptions): PropertyDecorator {
  const duplicateIn = (value: unknown): string | null => {
    if (!Array.isArray(value)) return null;
    const entries = value.filter(
      (entry): entry is { name: string; classId?: unknown } =>
        typeof entry === 'object' && entry !== null && typeof entry.name === 'string'
    );
    return duplicateClassEntry(
      entries.map(entry => ({
        name: entry.name,
        classId: typeof entry.classId === 'string' && entry.classId !== '' ? entry.classId : null,
      }))
    );
  };
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isUniqueClassList',
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate(value: unknown): boolean {
          return duplicateIn(value) === null;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} has a duplicate class "${duplicateIn(args.value)}"`;
        },
      },
    });
  };
}
