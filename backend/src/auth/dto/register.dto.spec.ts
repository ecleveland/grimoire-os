import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RegisterDto } from './register.dto';

function validate(payload: Partial<RegisterDto>) {
  return validateSync(plainToInstance(RegisterDto, payload));
}

describe('RegisterDto', () => {
  it('accepts a strong password', () => {
    const errors = validate({ username: 'gandalf', password: 'YouShallN0tPass!' });
    expect(errors).toHaveLength(0);
  });

  it('rejects a weak password', () => {
    const errors = validate({ username: 'gandalf', password: 'weakpass' });
    const messages = errors.flatMap(e => Object.values(e.constraints ?? {}));
    expect(messages).toEqual(
      expect.arrayContaining([expect.stringMatching(/at least 10 characters/)])
    );
  });
});
