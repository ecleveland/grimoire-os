import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..', '..', '..');

describe('Prettier configuration', () => {
  const prettierrcPath = resolve(ROOT, '.prettierrc');

  it('should have a .prettierrc file at the project root', () => {
    expect(existsSync(prettierrcPath)).toBe(true);

    const config = JSON.parse(readFileSync(prettierrcPath, 'utf-8'));
    expect(config).toHaveProperty('semi');
    expect(config).toHaveProperty('singleQuote');
    expect(config).toHaveProperty('trailingComma');
    expect(config).toHaveProperty('printWidth');
    expect(config).toHaveProperty('tabWidth');
  });
});
