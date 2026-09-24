// Child process for like-lint.spec.ts: lints a batch of snippets through the
// real ESLint API and prints the findings as JSON.
//
// It runs out of process because ESLint reaches a flat config by dynamic
// import, which Jest's CommonJS VM refuses without --experimental-vm-modules.
// Rebuilding a Linter from copied rule options would dodge that, but it would
// also certify behaviour CI never runs: `:has()` and friends are evaluated
// against whatever config assembled them. So the real ESLint instance resolves
// `files`/`ignores` and applies the rules, exactly as `npm run lint` does.
//
// Every snippet is linted under a file path that EXISTS. The TypeScript project
// service refuses a path it has never seen, and a refusal arrives as a fatal
// parse error with no rule findings at all, which would read as "nothing was
// flagged". The spec asserts `fatal` is empty for that reason.
//
// Input (stdin): [{ key, filePath, code }, ...]
// Output (stdout): { [key]: { restricted: string[], fatal: string[] } }
const { readFileSync } = require('fs');
const path = require('path');
const { ESLint } = require('eslint');

const BACKEND = path.resolve(__dirname, '..', '..');

async function main() {
  const jobs = JSON.parse(readFileSync(0, 'utf8'));
  const eslint = new ESLint({
    cwd: BACKEND,
    overrideConfigFile: path.join(BACKEND, 'eslint.config.mjs'),
  });

  const out = {};
  for (const job of jobs) {
    const [result] = await eslint.lintText(job.code, {
      filePath: path.join(BACKEND, job.filePath),
      warnIgnored: false,
    });
    const messages = result ? result.messages : [];
    out[job.key] = {
      restricted: messages.filter(m => m.ruleId === 'no-restricted-syntax').map(m => m.message),
      fatal: messages.filter(m => m.fatal).map(m => m.message),
    };
  }
  process.stdout.write(JSON.stringify(out));
}

main().catch(error => {
  process.stderr.write(String(error && error.stack ? error.stack : error));
  process.exit(1);
});
