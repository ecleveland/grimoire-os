import { registerDecorator, ValidationOptions } from 'class-validator';

// Inclusive [min, max] tuple rolled at loot-generation time: two integers,
// each ≥ `floor`, with min ≤ max.
export function IsLootRange(
  constraints: { floor: number },
  validationOptions?: ValidationOptions
): PropertyDecorator {
  return function (target: object, propertyName: string | symbol) {
    registerDecorator({
      name: 'isLootRange',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `${String(propertyName)} must be a [min, max] pair of integers ≥ ${constraints.floor} with min ≤ max`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return (
            Array.isArray(value) &&
            value.length === 2 &&
            value.every(v => Number.isInteger(v) && v >= constraints.floor) &&
            (value[0] as number) <= (value[1] as number)
          );
        },
      },
    });
  };
}
