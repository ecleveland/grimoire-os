import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, ValidationOptions } from 'class-validator';

/**
 * `@IsBoolean()` for `@Body()` fields that is immune to the global pipe's
 * `enableImplicitConversion` (see GLOBAL_VALIDATION_PIPE_OPTIONS).
 *
 * Implicit conversion coerces any non-empty string — including `'false'` — to
 * `true` before validation runs, so a plain `@IsBoolean()` would accept
 * `{ flag: "false" }` and land it as `true`. The transform restores the raw
 * body value (`obj[key]`, since `value` is already coerced) so `@IsBoolean`
 * sees the original and rejects non-boolean input. Use on every boolean body
 * field; query/param booleans should keep using `@IsBooleanString()`.
 */
export function IsStrictBoolean(options?: ValidationOptions): PropertyDecorator {
  return applyDecorators(
    Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key]),
    IsBoolean(options)
  );
}
