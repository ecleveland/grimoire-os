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

  it('should have format and format:check scripts in backend package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'backend', 'package.json'), 'utf-8'));
    expect(pkg.scripts.format).toBeDefined();
    expect(pkg.scripts['format:check']).toBeDefined();
    expect(pkg.scripts.format).toContain('prettier');
    expect(pkg.scripts['format:check']).toContain('prettier');
  });

  it('should have format and format:check scripts in frontend package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, 'frontend', 'package.json'), 'utf-8'));
    expect(pkg.scripts.format).toBeDefined();
    expect(pkg.scripts['format:check']).toBeDefined();
    expect(pkg.scripts.format).toContain('prettier');
    expect(pkg.scripts['format:check']).toContain('prettier');
  });

  it('should have a .prettierignore file that excludes build artifacts', () => {
    const ignorePath = resolve(ROOT, '.prettierignore');
    expect(existsSync(ignorePath)).toBe(true);

    const content = readFileSync(ignorePath, 'utf-8');
    expect(content).toContain('node_modules');
    expect(content).toContain('dist');
    expect(content).toContain('.next');
    expect(content).toContain('coverage');
  });
});
