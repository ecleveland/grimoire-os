import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// A well-formed die spec like "1d3" or "2d6". Mirrors the parser in
// seeded-rng.ts (rollDie): the count defaults to 1 when omitted, and both
// count and sides must be at least 1 — "0d6", "1d0" and "d0" roll nothing and
// would otherwise crash the die parser with an opaque 500 at generation time.
export const DIE_SPEC_PATTERN = /^(\d*)d(\d+)$/i;

export function isDieSpec(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const match = DIE_SPEC_PATTERN.exec(value.trim());
  if (!match) return false;
  const count = match[1] === '' ? 1 : parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  return count >= 1 && sides >= 1;
}

@ValidatorConstraint({ name: 'isDieSpec', async: false })
class IsDieSpecConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isDieSpec(value);
  }

  defaultMessage(): string {
    return '$property must be a die spec like "1d3" (count and sides at least 1)';
  }
}

export function IsDieSpec(options?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol) => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      validator: IsDieSpecConstraint,
    });
  };
}
