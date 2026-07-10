import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Cross-field bound: the decorated number must not exceed the named sibling
 * property on the same object. Both must already be numbers (pair it with
 * `@IsInt`/`@IsNumber`); a non-numeric sibling fails here too, which is fine —
 * the sibling's own validators report the root cause alongside.
 *
 * First use: `ResourceDto.used <= max` (VEG-409) — independently-ranged bounds
 * would accept `{ max: 5, used: 50 }` and the sheet would render a negative
 * remaining count.
 */
export function IsLteSibling(property: string, options?: ValidationOptions): PropertyDecorator {
  return function (object: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isLteSibling',
      target: object.constructor,
      propertyName: propertyName as string,
      constraints: [property],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [siblingName] = args.constraints as [string];
          const sibling = (args.object as Record<string, unknown>)[siblingName];
          return typeof value === 'number' && typeof sibling === 'number' && value <= sibling;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must not exceed ${(args.constraints as [string])[0]}`;
        },
      },
    });
  };
}
