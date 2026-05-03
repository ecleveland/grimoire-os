import { validateSync } from 'class-validator';
import { IsStrongPassword, PASSWORD_MIN_LENGTH } from './strong-password.decorator';

class TestDto {
  @IsStrongPassword()
  password!: string;
}

function validatePassword(password: unknown) {
  const dto = new TestDto();
  (dto as { password: unknown }).password = password;
  return validateSync(dto);
}

function getMessages(password: unknown): string[] {
  const errors = validatePassword(password);
  return errors.flatMap(error => Object.values(error.constraints ?? {}));
}

describe('IsStrongPassword', () => {
  describe('valid passwords', () => {
    it('accepts a password with all required character classes and min length', () => {
      expect(validatePassword('SecurePass1!23')).toHaveLength(0);
    });

    it('accepts a password at exactly the minimum length when all rules pass', () => {
      const password = 'Aa1!aaaaaa';
      expect(password).toHaveLength(PASSWORD_MIN_LENGTH);
      expect(validatePassword(password)).toHaveLength(0);
    });
  });

  describe('rejects weak passwords with clear messages', () => {
    it('rejects a password shorter than 10 characters', () => {
      const messages = getMessages('Abc1!xyz');
      expect(messages).toContain(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
    });

    it('rejects a password with no uppercase letter', () => {
      const messages = getMessages('alllowercase1!');
      expect(messages).toContain('Password must contain at least one uppercase letter');
    });

    it('rejects a password with no lowercase letter', () => {
      const messages = getMessages('ALLUPPERCASE1!');
      expect(messages).toContain('Password must contain at least one lowercase letter');
    });

    it('rejects a password with no digit', () => {
      const messages = getMessages('NoDigitsHere!');
      expect(messages).toContain('Password must contain at least one number');
    });

    it('rejects a password with no special character', () => {
      const messages = getMessages('NoSpecial1234');
      expect(messages).toContain('Password must contain at least one special character');
    });

    it('returns multiple messages when multiple rules fail', () => {
      const messages = getMessages('short');
      expect(messages).toEqual(
        expect.arrayContaining([
          `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
          'Password must contain at least one uppercase letter',
          'Password must contain at least one number',
          'Password must contain at least one special character',
        ])
      );
    });
  });

  describe('non-string inputs', () => {
    it('rejects a non-string value', () => {
      const errors = validatePassword(12345678910);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
