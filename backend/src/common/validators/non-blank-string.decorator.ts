import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, ValidationOptions } from 'class-validator';

// Required string field that also rejects empty and whitespace-only values.
export function IsNonBlankString(options?: ValidationOptions): PropertyDecorator {
  return applyDecorators(
    IsString(options),
    Matches(/\S/, { message: '$property is required', ...options })
  );
}
