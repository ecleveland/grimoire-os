import { applyDecorators } from '@nestjs/common';
import {
  IsString,
  MinLength,
  Validate,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const PASSWORD_MIN_LENGTH = 10;

function makeRuleConstraint(name: string, test: RegExp, message: string) {
  @ValidatorConstraint({ name, async: false })
  class RuleConstraint implements ValidatorConstraintInterface {
    validate(value: unknown): boolean {
      return typeof value === 'string' && test.test(value);
    }
    defaultMessage(): string {
      return message;
    }
  }
  return RuleConstraint;
}

const HasUppercaseConstraint = makeRuleConstraint(
  'passwordHasUppercase',
  /[A-Z]/,
  'Password must contain at least one uppercase letter'
);

const HasLowercaseConstraint = makeRuleConstraint(
  'passwordHasLowercase',
  /[a-z]/,
  'Password must contain at least one lowercase letter'
);

const HasDigitConstraint = makeRuleConstraint(
  'passwordHasDigit',
  /\d/,
  'Password must contain at least one number'
);

const HasSpecialConstraint = makeRuleConstraint(
  'passwordHasSpecial',
  /[^A-Za-z0-9]/,
  'Password must contain at least one special character'
);

export function IsStrongPassword(options?: ValidationOptions): PropertyDecorator {
  return applyDecorators(
    IsString(options),
    MinLength(PASSWORD_MIN_LENGTH, {
      ...options,
      message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
    }),
    Validate(HasUppercaseConstraint, options),
    Validate(HasLowercaseConstraint, options),
    Validate(HasDigitConstraint, options),
    Validate(HasSpecialConstraint, options)
  );
}
