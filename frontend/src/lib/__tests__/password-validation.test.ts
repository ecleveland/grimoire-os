import { describe, it, expect } from 'vitest';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_TEXT,
  validatePassword,
} from '../password-validation';

describe('validatePassword', () => {
  it('returns null for a strong password', () => {
    expect(validatePassword('SecurePass1!23')).toBeNull();
  });

  it(`flags passwords shorter than ${PASSWORD_MIN_LENGTH} characters`, () => {
    expect(validatePassword('Aa1!short')).toMatch(/at least 10 characters/);
  });

  it('flags passwords without an uppercase letter', () => {
    expect(validatePassword('alllowercase1!')).toMatch(/uppercase/);
  });

  it('flags passwords without a lowercase letter', () => {
    expect(validatePassword('ALLUPPERCASE1!')).toMatch(/lowercase/);
  });

  it('flags passwords without a number', () => {
    expect(validatePassword('NoDigitsHere!')).toMatch(/number/);
  });

  it('flags passwords without a special character', () => {
    expect(validatePassword('NoSpecial1234')).toMatch(/special character/);
  });

  it('exposes a human-readable requirements summary', () => {
    expect(PASSWORD_REQUIREMENTS_TEXT).toMatch(/10/);
    expect(PASSWORD_REQUIREMENTS_TEXT).toMatch(/uppercase/);
  });
});
