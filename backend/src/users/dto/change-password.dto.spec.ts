import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

function validate(payload: Partial<ChangePasswordDto>) {
  return validateSync(plainToInstance(ChangePasswordDto, payload));
}

describe('ChangePasswordDto', () => {
  it('accepts a strong new password', () => {
    const errors = validate({ currentPassword: 'anything', newPassword: 'StrongP@ss1!' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a new password missing a special character', () => {
    const errors = validate({ currentPassword: 'anything', newPassword: 'NoSpecial1234' });
    const messages = errors.flatMap(e => Object.values(e.constraints ?? {}));
    expect(messages).toEqual(expect.arrayContaining([expect.stringMatching(/special character/)]));
  });

  it('still requires a non-empty currentPassword', () => {
    const errors = validate({ currentPassword: '', newPassword: 'StrongP@ss1!' });
    expect(errors.length).toBeGreaterThan(0);
  });
});
