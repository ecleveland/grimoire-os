import { ValidateIf, ValidationOptions } from 'class-validator';

/**
 * Absent or valid, never null. The nested-Json counterpart to `@IsOptional()`.
 *
 * `@IsOptional()` means "null clears this column" (VEG-316), which is right for a
 * top-level column and wrong inside a Json blob: there is no column to clear, and
 * the shared interface types the field `T | undefined`. Without this,
 * `{ prerequisiteLogic: null }` validates clean and is stored.
 *
 * Pairing a null guard with `@IsOptional()` does not work, which is why this
 * replaces it rather than joining it. `@IsOptional()` is not a validator but a
 * CONDITIONAL_VALIDATION whose condition is `value !== null && value !== undefined`;
 * when it is false class-validator skips *every* validator on the property,
 * including the guard you just added beside it. Dropping null from the condition
 * lets null fall through to the real validators, which reject it.
 */
export function IsOptionalNotNull(options?: ValidationOptions): PropertyDecorator {
  return ValidateIf((_object, value) => value !== undefined, options);
}
