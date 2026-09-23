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
// Both spellings of the key, because a quoted `'mode'` parses as a string
// literal rather than an identifier. Three shapes for the value, because all
// three were in the tree: the bare literal, the `Prisma.QueryMode.insensitive`
// member, and the literal widened with `as const`, which wraps it in a
// TSAsExpression that a plain `value.value` test walks straight past.
const noRawInsensitiveMode = {
  selector:
    "Property:matches([key.name='mode'], [key.value='mode']):matches([value.value='insensitive'], [value.property.name='insensitive'], [value.expression.value='insensitive'])",
  message:
    'Build case-insensitive Prisma filters with containsInsensitive from common/helpers/like.ts (or catalogNameWhere, which uses it), so LIKE metacharacters are escaped.',
};

// The raw-SQL half of the same bug, and the half it was worst in: a hand-written
// `ILIKE ${value}` binds a pattern exactly as Prisma's does, with nothing in the
// types to say so.
//
// A template literal offers no way to correlate "this quasi ends in ILIKE" with
// "the expression that follows it" in one selector, so each interpolation slot
// is spelled out: quasi i ends in ILIKE, and expression i is not a call to
// likeContainsPattern. The helper must therefore appear AT the binding site
// rather than through a local, which is the point — the escape is then visible
// wherever the pattern is bound. Six slots covers every builder in the tree with
// room to spare; a seventh ILIKE in one template would go unchecked, so extend
// the range if one appears.
const noRawIlikePattern = {
  selector: [0, 1, 2, 3, 4, 5]
    .map(
      slot =>
        `TemplateLiteral[quasis.${slot}.value.raw=/ilike\\s*$/i][expressions.${slot}.callee.name!='likeContainsPattern']`
    )
    .join(', '),
  message:
    'Bind an ILIKE pattern with likeContainsPattern(value) from common/helpers/like.ts, at the binding site, so LIKE metacharacters are escaped.',
};

// Prisma's `contains`, `startsWith` and `endsWith` compile to LIKE, which honours
// the same wildcards whether or not `mode` is set. A value that went through a
// helper is a call; a bare identifier or literal went through nothing. The
// `mode` case is left to noRawInsensitiveMode so one filter is not reported
// twice.
const noUnescapedLikeFilter = {
  selector:
    "ObjectExpression:not(:has(> Property:matches([key.name='mode'], [key.value='mode']))) > Property:matches([key.name='contains'], [key.name='startsWith'], [key.name='endsWith']):not([value.type='CallExpression'])",
  message:
    'contains/startsWith/endsWith compile to LIKE. Escape the value with escapeLike, or use containsInsensitive, from common/helpers/like.ts.',
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
    // lives, so the helpers cannot be built out of themselves.
    // `test/**` is in the lint script's glob and its `.db-spec.ts` files build
    // real queries, so they are covered too. They do not match the `**/*.spec.ts`
    // ignore below (the separator before `spec` is a hyphen), which is what keeps
    // them guarded rather than exempt by accident.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    ignores: ['**/*.spec.ts', 'src/test/**', 'src/common/helpers/like.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        noContentCrudOverride,
        noRawInsensitiveMode,
        noRawIlikePattern,
        noUnescapedLikeFilter,
      ],
    },
  }
);
