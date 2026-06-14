import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsOptional } from 'class-validator';
import { GLOBAL_VALIDATION_PIPE_OPTIONS } from '../../bootstrap-config';
import { IsStrictBoolean } from './is-strict-boolean.decorator';

class Subject {
  @IsOptional()
  @IsStrictBoolean()
  flag?: boolean;
}

// Run payloads through the *production* pipe so the test exercises the same
// enableImplicitConversion behavior real requests hit (the whole point of the
// decorator). transform() returns the validated instance or throws on failure.
const pipe = new ValidationPipe(GLOBAL_VALIDATION_PIPE_OPTIONS);
const transform = (payload: Record<string, unknown>) =>
  pipe.transform(payload, { type: 'body', metatype: Subject });

// The pipe throws BadRequestException with the per-field messages on the
// response body (its top-level `.message` is just "Bad Request Exception").
async function rejectionMessages(payload: Record<string, unknown>): Promise<string[]> {
  try {
    await transform(payload);
    throw new Error(`expected rejection for ${JSON.stringify(payload)}`);
  } catch (err) {
    if (!(err instanceof BadRequestException)) throw err;
    return (err.getResponse() as { message: string[] }).message;
  }
}

describe('IsStrictBoolean', () => {
  it('accepts a real boolean true', async () => {
    await expect(transform({ flag: true })).resolves.toEqual({ flag: true });
  });

  it('accepts a real boolean false', async () => {
    await expect(transform({ flag: false })).resolves.toEqual({ flag: false });
  });

  it('rejects the string "false" instead of silently coercing it to true', async () => {
    // The bug this guards: implicit conversion turns any non-empty string into
    // true, so without the raw-value transform { flag: "false" } would validate
    // and land as true.
    expect(await rejectionMessages({ flag: 'false' })).toContain('flag must be a boolean value');
  });

  it('rejects the string "true" (non-boolean input is non-boolean input)', async () => {
    expect(await rejectionMessages({ flag: 'true' })).toContain('flag must be a boolean value');
  });

  it('rejects an arbitrary non-empty string', async () => {
    expect(await rejectionMessages({ flag: 'yes' })).toContain('flag must be a boolean value');
  });

  it('rejects a numeric value', async () => {
    expect(await rejectionMessages({ flag: 1 })).toContain('flag must be a boolean value');
  });

  it('allows the field to be omitted (optional)', async () => {
    await expect(transform({})).resolves.toEqual({});
  });
});
