// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// TypeScript has no `final`, and ContentCrudService's create/update/remove
// ARE the tiered-content authorization sequence (VEG-336): assert the tier,
// load-and-guard before any mutation, force the ownership stamp, map write
// errors to the loaded row's tier. A subclass that overrides one of them
// silently leaves that audited path, which is the drift this base exists to
// prevent. Entity-specific behavior belongs in the beforeCreate, beforeUpdate,
// performUpdate and performDelete hooks, which run inside the sequence.
const noContentCrudOverride = {
  selector:
    "ClassDeclaration[superClass.name='ContentCrudService'] > ClassBody > MethodDefinition[key.name=/^(create|update|remove|findWritableRow)$/]",
  message:
    'Do not override the ContentCrudService authorization skeleton (create/update/remove/findWritableRow). Override beforeCreate, beforeUpdate, performUpdate or performDelete instead.',
};

// `mode: 'insensitive'` compiles to ILIKE, which reads its argument as a
// pattern, so an unescaped `%` or `_` from a query string is a wildcard
// (VEG-529). The helpers escape it; this keeps the next filter from being
// written by hand without them.
//
// Both spellings of the key, because a quoted or computed `'mode'` parses as a
// string literal rather than an identifier. Three shapes for the value, because
// all three were in the tree: the bare literal, the
// `Prisma.QueryMode.insensitive` member, and the literal widened with
// `as const`, which wraps it in a TSAsExpression that a plain `value.value` test
// walks straight past.
const insensitiveModeProperty =
  "Property:matches([key.name='mode'], [key.value='mode']):matches([value.value='insensitive'], [value.property.name='insensitive'], [value.expression.value='insensitive'])";

// The calls that count as escaping. An allowlist rather than "any call": a value
// that has been through `q.trim()` is a call too, and is no safer than `q`. Both
// a bare call and a qualified one (`like.escapeLike`, `this.escapeLike`) count,
// since the helper is the same either way.
const ESCAPING_HELPERS = [
  'escapeLike',
  'containsInsensitive',
  'startsWithInsensitive',
  'endsWithInsensitive',
  'equalsInsensitive',
  'likeContainsPattern',
  'ilikeContains',
];
const escapingCallOn = subject =>
  `:matches(${ESCAPING_HELPERS.flatMap(helper => [
    `[${subject}.callee.name='${helper}']`,
    `[${subject}.callee.property.name='${helper}']`,
  ]).join(', ')})`;

// Prisma's `contains`, `startsWith` and `endsWith` compile to LIKE, which honours
// the same wildcards whether or not `mode` is set. Written as a key or assigned
// to one later, and spelled bare, quoted or computed.
//
// A string literal value is exempt. These three words are not Prisma's alone
// (`{ startsWith: '/api' }` is a route matcher), and a value written into the
// source carries no user input to escape, so flagging it would be noise with an
// escaping message attached.
const LIKE_FILTER_KEYS = ['contains', 'startsWith', 'endsWith'];
const likeFilterKey = `:matches(${LIKE_FILTER_KEYS.flatMap(key => [
  `[key.name='${key}']`,
  `[key.value='${key}']`,
]).join(', ')})`;
const likeFilterTarget = `:matches(${LIKE_FILTER_KEYS.flatMap(key => [
  `[left.property.name='${key}']`,
  `[left.property.value='${key}']`,
]).join(', ')})`;

const noRawInsensitiveMode = {
  selector: insensitiveModeProperty,
  message:
    'Build case-insensitive Prisma filters with containsInsensitive from common/helpers/like.ts (or catalogNameWhere, which uses it), so LIKE metacharacters are escaped.',
};

// The raw-SQL half of the same bug, and the half it was worst in: a hand-written
// `ILIKE ${value}` binds a pattern exactly as Prisma's does, with nothing in the
// types to say so.
//
// So the operator itself is what is banned. Outside the helper module there is
// no legitimate reason to write it, and banning the operator rather than the
// binding catches every spelling at once: plain LIKE, the `~~` and `~~*`
// operators, a pattern concatenated SQL-side with `||`, and any number of
// interpolation slots. `ilikeContains` is the one place it is written, so it is
// also the one place that can get it wrong.
const noRawLikeOperator = {
  selector:
    "TaggedTemplateExpression[tag.property.name='sql'] > TemplateLiteral > TemplateElement[value.raw=/(like[\\s(]|like$|~~)/i]",
  message:
    'Do not write LIKE/ILIKE by hand. Compose ilikeContains(column, value) from common/helpers/like.ts, which binds the escaped pattern.',
};

// Suppressed only by a `mode` sibling that noRawInsensitiveMode itself
// recognises, so a filter is never reported twice and a `mode` written some
// other way (a variable, say) cannot buy silence here as well as there.
const noUnescapedLikeFilter = {
  selector: `ObjectExpression:not(:has(> ${insensitiveModeProperty})) > Property${likeFilterKey}:not([value.type='Literal']):not(${escapingCallOn('value')})`,
  message:
    'contains/startsWith/endsWith compile to LIKE. Escape the value with escapeLike, or use containsInsensitive, from common/helpers/like.ts.',
};

// The same filter written as a mutation rather than a literal. No `mode`
// exemption here: an assignment has no siblings to read it from.
const noUnescapedLikeAssignment = {
  selector: `AssignmentExpression${likeFilterTarget}:not([right.type='Literal']):not(${escapingCallOn('right')})`,
  message:
    'contains/startsWith/endsWith compile to LIKE. Escape the assigned value with escapeLike from common/helpers/like.ts.',
};

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'dist/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': ['error', noContentCrudOverride],
    },
  },
  {
    // unbound-method false-positives on `expect(mock.method)` assertions where
    // the "method" is a jest.fn() that is never actually invoked unbound.
    files: ['**/*.spec.ts', 'src/test/**'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    // The insensitive-mode ban states its own scope here rather than being
    // subtracted again in each exempt file's block. ESLint replaces a rule's
    // options wholesale instead of merging them, so a keep-list restated
    // elsewhere would silently drop whatever is added to the global rule next.
    //
    // Exempt: a spec writes the literal as an expected value, which is the
    // query being pinned, and common/helpers/like.ts is where the escaping
    // lives, so the helpers cannot be built out of themselves. `src/test/**` is
    // deliberately not exempt: it holds fixtures and a Prisma mock, none of
    // which build a filter, so there is nothing there to excuse.
    // `test/**` is in the lint script's glob and its `.db-spec.ts` files build
    // real queries, so they are covered too. They do not match the `**/*.spec.ts`
    // ignore below (the separator before `spec` is a hyphen), which is what keeps
    // them guarded rather than exempt by accident.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    ignores: ['**/*.spec.ts', 'src/common/helpers/like.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noContentCrudOverride,
        noRawInsensitiveMode,
        noRawLikeOperator,
        noUnescapedLikeFilter,
        noUnescapedLikeAssignment,
      ],
    },
  }
);
