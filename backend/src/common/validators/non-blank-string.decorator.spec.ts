import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsNonBlankString } from './non-blank-string.decorator';

class Subject {
  @IsNonBlankString()
  name!: string;
}

function validate(payload: Record<string, unknown>) {
  return validateSync(plainToInstance(Subject, payload));
}

function messages(errors: ReturnType<typeof validateSync>) {
  return errors.flatMap(e => Object.values(e.constraints ?? {}));
}

describe('IsNonBlankString', () => {
  it('accepts a non-blank string', () => {
    expect(validate({ name: 'Arannis' })).toEqual([]);
  });

  it('rejects a missing value with "<property> is required"', () => {
    expect(messages(validate({}))).toEqual(expect.arrayContaining(['name is required']));
  });

  it('rejects an empty string', () => {
    expect(messages(validate({ name: '' }))).toEqual(expect.arrayContaining(['name is required']));
  });

  it('rejects a whitespace-only string', () => {
    expect(messages(validate({ name: '   ' }))).toEqual(
      expect.arrayContaining(['name is required'])
    );
  });

  it('rejects a non-string value', () => {
    expect(messages(validate({ name: 42 }))).toEqual(
      expect.arrayContaining([expect.stringContaining('must be a string')])
    );
  });
});
