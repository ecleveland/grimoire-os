import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateUserDto } from './update-user.dto';

// Mirror the global ValidationPipe (bootstrap-config.ts): plainToInstance with
// enableImplicitConversion runs before validation in production.
function toDto(payload: object) {
  return plainToInstance(UpdateUserDto, payload, { enableImplicitConversion: true });
}

function validate(payload: object) {
  return validateSync(toDto(payload));
}

describe('UpdateUserDto', () => {
  it('accepts an explicit null email (clear the field)', () => {
    expect(validate({ email: null })).toHaveLength(0);
  });

  it('preserves null through transform', () => {
    expect(toDto({ email: null }).email).toBeNull();
  });

  it('accepts a valid email and an omitted one', () => {
    expect(validate({ email: 'gandalf@middleearth.com' })).toHaveLength(0);
    expect(validate({})).toHaveLength(0);
  });

  it('rejects a malformed email', () => {
    expect(validate({ email: 'not-an-email' }).length).toBeGreaterThan(0);
  });

  it('rejects an empty or whitespace-only displayName (non-nullable column)', () => {
    expect(validate({ displayName: '' }).length).toBeGreaterThan(0);
    expect(validate({ displayName: '   ' }).length).toBeGreaterThan(0);
  });

  it('accepts a normal displayName', () => {
    expect(validate({ displayName: 'Gandalf the Grey' })).toHaveLength(0);
  });
});
