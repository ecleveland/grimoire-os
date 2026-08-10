import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsArray, ValidationOptions } from 'class-validator';

/**
 * `@IsArray()` that a plain object cannot slip past.
 *
 * The global pipe runs with `enableImplicitConversion`, so class-transformer
 * reads `design:type = Array` for a `string[]` property and coerces whatever it
 * was given: for a plain object it does `new Array()` and copies the non-index
 * keys, which for `{ a: 'Perceptoin' }` or `{}` yields `[]`. That happens
 * *before* validation, so a bare `@IsArray()` sees a legitimate empty array and
 * passes — the request is accepted with a 200 and the coerced `[]` is written
 * over the stored column. A custom `@Transform` cannot detect it either: its
 * `value` is the already-coerced `[]`.
 *
 * The `obj` argument is the untouched source payload, so the transform below
 * reads the raw value and hands the original object back to `@IsArray()`, which
 * then rejects it. Only non-null non-array objects are overridden — `null` and
 * every scalar pass through untouched, so this composes with a call site's own
 * null handling in either decorator order.
 *
 * Note this guards the *shape*, not the presence: pair with `@IsOptional()` (to
 * allow null) or `@ValidateIf(v => v !== undefined)` (to reject null but allow
 * an absent key).
 */
export function IsStrictArray(options?: ValidationOptions): PropertyDecorator {
  return applyDecorators(
    Transform(({ value, key, obj }) => {
      const raw = (obj as Record<string, unknown>)?.[key];
      const coercedFromObject =
        raw !== null && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(value);
      return coercedFromObject ? raw : (value as unknown);
    }),
    IsArray(options)
  );
}
