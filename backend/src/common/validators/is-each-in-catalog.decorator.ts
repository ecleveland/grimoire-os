import { applyDecorators } from '@nestjs/common';
import { IsIn, ValidationOptions } from 'class-validator';

/**
 * Every entry of a string array must belong to `catalog`.
 *
 * This wraps `@IsIn(catalog, { each: true })` for one reason: to fix its
 * message. class-validator builds `validationArguments` once, with `value` set
 * to the *whole array*, before it branches into per-item validation — so the
 * stock message can only recite the legal values, never the one the caller
 * actually sent. On an 18-entry catalog like the SRD skills that is a wall of
 * text that omits the single fact the caller needs. The message below
 * recomputes the offenders so a 400 names them.
 *
 * Pair with `@IsArray()`. A non-array value skips class-validator's `each`
 * branch entirely, which would leave `@IsIn` validating the bare value against
 * the catalog — so `skills: 'Athletics'` would pass without it.
 *
 * @param catalog the permitted values
 * @param noun singular name for one entry, used in the message ('skill')
 */
export function IsEachInCatalog(
  catalog: readonly string[],
  noun: string,
  options?: ValidationOptions
): PropertyDecorator {
  return applyDecorators(
    IsIn(catalog, {
      ...options,
      // After the spread: neither is a caller's to override.
      each: true,
      message: ({ property, value }) => {
        const offenders = (Array.isArray(value) ? (value as unknown[]) : [value])
          .filter(entry => !catalog.includes(entry as string))
          .map(entry => `'${String(entry)}'`);
        return `${property} contains unknown ${noun}: ${offenders.join(', ')}`;
      },
    })
  );
}
