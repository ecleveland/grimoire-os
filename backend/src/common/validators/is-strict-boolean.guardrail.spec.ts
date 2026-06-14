import { readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

// VEG-323 guardrail: bare @IsBoolean() on a @Body() field is silently unsafe —
// the global pipe's enableImplicitConversion coerces any non-empty string
// (including "false") to true before validation. Every boolean body field must
// use @IsStrictBoolean() instead. This meta-test (like config/prettier.spec.ts)
// turns a future regression into a hard CI failure rather than a silent bug, so
// nobody has to remember the rule. Query/param strings keep @IsBooleanString().

const SRC = resolve(__dirname, '..', '..');
const BARE_IS_BOOLEAN = /@IsBoolean\s*\(/; // does not match @IsBooleanString(

function dtoFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) return dtoFiles(full);
    return entry.isFile() && entry.name.endsWith('.dto.ts') ? [full] : [];
  });
}

describe('@IsStrictBoolean guardrail', () => {
  it('no *.dto.ts file uses bare @IsBoolean() (use @IsStrictBoolean instead)', () => {
    const offenders = dtoFiles(SRC).filter(file =>
      BARE_IS_BOOLEAN.test(readFileSync(file, 'utf-8'))
    );

    expect(offenders.map(f => f.slice(SRC.length + 1))).toEqual([]);
  });
});
