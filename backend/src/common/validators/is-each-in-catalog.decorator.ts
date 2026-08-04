import { applyDecorators } from '@nestjs/common';
import { IsIn, ValidationOptions } from 'class-validator';

/**
 * How many offending entries a rejection message names before summarising the
 * rest as a count. Enumerating offenders is unbounded by construction — without
 * a cap, a large bogus array reflects its own contents back at roughly 1:1,
 * where the `@IsString({ each: true })` message it replaced was fixed-size.
 * Ten is well past what a human reads and far short of anything worth sending.
 */
const MAX_NAMED_OFFENDERS = 10;

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
  // `each` and `message` are omitted rather than merely overwritten below: the
  // spread order already made them un-overridable, but silently. Omitting them
  // turns that into a compile error at the call site. `each: false` contradicts
  // the name and the @IsArray pairing, and the message is the whole reason this
  // wrapper exists.
  options?: Omit<ValidationOptions, 'each' | 'message'>
): PropertyDecorator {
  return applyDecorators(
    IsIn(catalog, {
      ...options,
      each: true,
      message: ({ property, value }) => {
        const offenders = (Array.isArray(value) ? (value as unknown[]) : [value]).filter(
          entry => !catalog.includes(entry as string)
        );
        const named = offenders
          .slice(0, MAX_NAMED_OFFENDERS)
          .map(entry => `'${String(entry)}'`)
          .join(', ');
        const overflow = offenders.length - MAX_NAMED_OFFENDERS;
        return (
          `${property} contains unknown ${noun}: ${named}` +
          (overflow > 0 ? ` (+${overflow} more)` : '')
        );
      },
    })
  );
}
