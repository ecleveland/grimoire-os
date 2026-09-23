// Guards the LIKE-escaping lint rules in eslint.config.mjs (VEG-529).
//
// The rules are the only thing standing between a new query and the wildcard
// bug, and they are two things at once: selectors that must match the dangerous
// shapes, and a `files`/`ignores` scope that decides where they run at all. Both
// are edited by hand and neither fails loudly when it stops working. A selector
// narrowed by one character, or `files` trimmed back to `src/**`, leaves the
// whole tree green and unguarded.
//
// So the real config lints real snippets, through the real ESLint API, in the
// child process `lint-snippets.cjs` (which explains why it is a child). Every
// snippet in this file goes over in one batch, so the whole suite costs one
// process. Each case then reads its own findings back out.
import { execFileSync } from 'child_process';
import { resolve } from 'path';

const BACKEND = resolve(__dirname, '..', '..');
const HARNESS = resolve(__dirname, 'lint-snippets.cjs');

// Paths that exist, because the TypeScript project service rejects one that does
// not. Each stands for a scope the config treats differently.
const GUARDED_SRC = 'src/srd/srd.service.ts';
const HELPER_MODULE = 'src/common/helpers/like.ts';
const UNIT_SPEC = 'src/srd/srd.service.spec.ts';
const DB_SPEC = 'test/db/srd-search.db-spec.ts';
const TEST_HELPERS = 'src/test/prisma-mock.factory.ts';

// Declarations rather than imports: the snippet replaces the file's contents, so
// nothing it names has to resolve for the selectors to see the right shapes.
const PRELUDE = [
  'declare const q: string;',
  "declare const m: 'insensitive';",
  'declare const Prisma: any;',
  'declare const like: any;',
  'declare const NAME: any;',
  'declare function escapeLike(v: string): string;',
  'declare function containsInsensitive(v: string): unknown;',
  'declare function likeContainsPattern(v: string): string;',
  'declare function ilikeContains(c: unknown, v: string): unknown;',
  'declare class ContentCrudService {}',
].join('\n');

type Finding = { restricted: string[]; fatal: string[] };

const jobs: Array<{ key: string; filePath: string; code: string }> = [];
let findings: Record<string, Finding> = {};

/** Queue a snippet at declaration time; `beforeAll` lints the whole batch at once. */
function queue(key: string, code: string, filePath = GUARDED_SRC): string {
  jobs.push({ key, filePath, code: `${PRELUDE}\n${code}\n` });
  return key;
}

function findingsFor(key: string): Finding {
  const finding = findings[key];
  if (!finding) throw new Error(`No lint result for ${key}`);
  // A fatal message means the snippet never parsed, so an empty `restricted`
  // would mean "not linted" rather than "not flagged".
  expect(finding.fatal).toEqual([]);
  return finding;
}

const FLAGGED: Array<[string, string]> = [
  ['a bare insensitive mode', "export const a = { contains: q, mode: 'insensitive' };"],
  ['a quoted mode key', "export const a = { contains: q, 'mode': 'insensitive' };"],
  ['the Prisma.QueryMode member', 'export const a = { mode: Prisma.QueryMode.insensitive };'],
  ['a mode widened with as const', "export const a = { mode: 'insensitive' as const };"],
  ['a bare contains', 'export const a = { contains: q };'],
  ['a bare startsWith', 'export const a = { startsWith: q };'],
  ['a bare endsWith', 'export const a = { endsWith: q };'],
  ['a raw ILIKE binding', 'export const a = Prisma.sql`"name" ILIKE ${q}`;'],
  ['a hand-built ILIKE pattern', "export const a = Prisma.sql`\"name\" ILIKE ${'%' + q + '%'}`;"],
  ['an ILIKE past the first slot', 'export const a = Prisma.sql`"a" = ${q} AND "n" ILIKE ${q}`;'],
  // The operator itself is what is banned outside the helper module, so the
  // escaped form is flagged here too: it belongs behind ilikeContains.
  [
    'the escaped pattern written inline',
    'export const a = Prisma.sql`"name" ILIKE ${likeContainsPattern(q)}`;',
  ],
  ['a case-sensitive LIKE', 'export const a = Prisma.sql`"name" LIKE ${q}`;'],
  ['the operator spelled as a tilde', 'export const a = Prisma.sql`"name" ~~* ${q}`;'],
  [
    'a pattern concatenated in SQL',
    "export const a = Prisma.sql`\"name\" ILIKE '%' || ${q} || '%'`;",
  ],
  // A call is not evidence of escaping unless it is one of the helpers, and a
  // `mode` the insensitive selectors do not recognise must not suppress the
  // bare-filter rule.
  ['a call that is not an escaping helper', 'export const a = { contains: q.trim() };'],
  ['a contains beside an unrecognised mode', 'export const a = { contains: q, mode: m };'],
  ['a computed filter key', "export const a = { ['contains']: q };"],
  ['a quoted filter key', "export const a = { 'startsWith': q };"],
  ['a filter assigned after the fact', 'export function f(w: any) { w.name.contains = q; }'],
  [
    'a filter assigned through a computed member',
    "export function f(w: any) { w.name['endsWith'] = q; }",
  ],
];

const CLEAN: Array<[string, string]> = [
  ['the contains helper', 'export const a = { name: containsInsensitive(q) };'],
  ['the composed raw-SQL helper', 'export const a = ilikeContains(NAME, q);'],
  ['SQL with no pattern operator', 'export const a = Prisma.sql`"level" = ${q}`;'],
  ['an explicitly escaped value', 'export const a = { contains: escapeLike(q) };'],
  // The allowlist keys on the method name, so a namespaced or instance call to
  // the same helper is recognised.
  ['a namespaced helper call', 'export const a = { contains: like.escapeLike(q) };'],
  [
    'an instance helper call',
    'export class C { escapeLike = escapeLike; m = { contains: this.escapeLike(q) }; }',
  ],
  // A hardcoded literal carries no user input, and these keys are not Prisma's
  // alone: a route matcher or a string test uses the same words.
  ['a literal route prefix', "export const a = { startsWith: '/api' };"],
  ['a literal catalog name', "export const a = { contains: 'Longsword' };"],
  ['a literal suffix assignment', "export function f(w: any) { w.name.endsWith = '.json'; }"],
];

for (const [name, code] of FLAGGED) queue(`flag:${name}`, code);
for (const [name, code] of CLEAN) queue(`clean:${name}`, code);

const SCOPE_SNIPPET = "export const a = { contains: q, mode: 'insensitive' };";
queue('scope:db-spec', SCOPE_SNIPPET, DB_SPEC);
queue('scope:helper', SCOPE_SNIPPET, HELPER_MODULE);
queue('scope:unit-spec', SCOPE_SNIPPET, UNIT_SPEC);
queue('scope:test-helpers', SCOPE_SNIPPET, TEST_HELPERS);
queue('scope:crud-override', 'export class A extends ContentCrudService { create() {} }');

describe('LIKE-escaping lint rules [VEG-529]', () => {
  beforeAll(() => {
    const printed = execFileSync(process.execPath, [HARNESS], {
      cwd: BACKEND,
      input: JSON.stringify(jobs),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    findings = JSON.parse(printed) as Record<string, Finding>;
  }, 120_000);

  describe('shapes it must flag', () => {
    it.each(FLAGGED)('flags %s', name => {
      expect(findingsFor(`flag:${name}`).restricted).not.toEqual([]);
    });
  });

  describe('shapes it must leave alone', () => {
    it.each(CLEAN)('leaves %s alone', name => {
      expect(findingsFor(`clean:${name}`).restricted).toEqual([]);
    });
  });

  // The scope is as load-bearing as the selectors: these pin which paths the
  // rules reach, so narrowing `files` or widening `ignores` fails here.
  describe('where the rules apply', () => {
    it('guards a real-DB spec, which builds real queries', () => {
      expect(findingsFor('scope:db-spec').restricted).not.toEqual([]);
    });

    it('guards the shared test helpers, which build no filters to excuse', () => {
      expect(findingsFor('scope:test-helpers').restricted).not.toEqual([]);
    });

    it('exempts the helper module, which is where the escaping lives', () => {
      expect(findingsFor('scope:helper').restricted).toEqual([]);
    });

    it('exempts a unit spec, which asserts on the literal filter it expects', () => {
      expect(findingsFor('scope:unit-spec').restricted).toEqual([]);
    });

    // The escaping rules live in their own block, which replaces the rule's
    // options rather than adding to them. If that block ever became the only
    // one, the unrelated ban it has to restate would vanish silently.
    it('still bans overriding the ContentCrudService skeleton', () => {
      expect(findingsFor('scope:crud-override').restricted).toEqual([
        expect.stringContaining('ContentCrudService authorization skeleton'),
      ]);
    });
  });
});
