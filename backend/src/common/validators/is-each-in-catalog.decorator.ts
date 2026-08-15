import { applyDecorators } from '@nestjs/common';
import { IsIn, ValidationOptions } from 'class-validator';
import { IsStrictArray } from './is-strict-array.decorator';

/**
 * How many *distinct* offending entries a rejection message names before
 * summarising the rest as a count, and how much of each one it prints.
 *
 * Both bounds are load-bearing. Enumerating offenders is unbounded by
 * construction — the `@IsString({ each: true })` message this replaced was
 * fixed-size — and capping only the count still lets a caller reflect its own
 * body back at roughly 1:1 with fewer, larger entries: ten 100KB strings sit
 * under the 1MB body limit and produced a ~1MB 400 before the length cap.
 * Callers are also de-duplicated, so a value repeated to fill the budget can't
 * crowd the real typo out of the message.
 */
const MAX_NAMED_OFFENDERS = 10;
const MAX_OFFENDER_CHARS = 40;

/**
 * Render one offending entry for the message.
 *
 * `JSON.stringify` rather than `String()`: coercion flattens a nested array via
 * `Array.prototype.toString`, so `[['Athletics']]` used to report
 * `unknown skill: 'Athletics'` — quoting a perfectly canonical name and telling
 * the caller it was unknown — and an object coerced to `[]` by the pipe
 * stringified to `''`, naming nothing at all.
 *
 * The `$` strip defuses a second interpolation pass: class-validator runs
 * `ValidationUtils.replaceMessageSpecialTokens` over whatever a custom `message`
 * function returns, so a caller-supplied `$constraint1` would expand into the
 * whole catalog (the exact stock-`@IsIn` wall of text this wrapper exists to
 * replace), `$target` into the DTO class name, and `$value` into the whole
 * array. There is no escape sequence for those tokens — the replacement is a
 * plain regex over the finished string — so the sigil itself has to go.
 */
function renderOffender(entry: unknown): string {
  const raw = typeof entry === 'string' ? entry : (JSON.stringify(entry) ?? String(entry));
  const clipped = raw.length > MAX_OFFENDER_CHARS ? `${raw.slice(0, MAX_OFFENDER_CHARS)}…` : raw;
  return `'${clipped.replace(/\$/g, '')}'`;
}

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
 * The array guard is composed in rather than left to the call site. A non-array
 * value skips class-validator's `each` branch entirely, which would leave
 * `@IsIn` validating the bare value against the catalog — so `skills:
 * 'Athletics'` would pass without it. That made the pairing load-bearing but
 * forgettable; {@link IsStrictArray} now travels with the catalog check, and
 * also closes the object-coercion hole a bare `@IsArray()` leaves open.
 *
 * Optionality stays at the call site: pair with `@IsOptional()` or
 * `@ValidateIf(v => v !== undefined)`.
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
  // the name and the array pairing, and the message is the whole reason this
  // wrapper exists.
  options?: Omit<ValidationOptions, 'each' | 'message'>
): PropertyDecorator {
  return applyDecorators(
    IsStrictArray(),
    IsIn(catalog, {
      ...options,
      each: true,
      message: ({ property, value }) => {
        const entries = Array.isArray(value) ? (value as unknown[]) : [value];
        const offenders = [...new Set(entries.filter(entry => !catalog.includes(entry as string)))];
        const named = offenders.slice(0, MAX_NAMED_OFFENDERS).map(renderOffender).join(', ');
        const overflow = offenders.length - MAX_NAMED_OFFENDERS;
        return (
          `${property} contains unknown ${noun}: ${named}` +
          (overflow > 0 ? ` (+${overflow} more)` : '')
        );
      },
    })
  );
}
