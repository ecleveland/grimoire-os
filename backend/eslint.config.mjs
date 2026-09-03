// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

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
      // TypeScript has no `final`, and ContentCrudService's create/update/remove
      // ARE the tiered-content authorization sequence (VEG-336): assert the tier,
      // load-and-guard before any mutation, force the ownership stamp, map write
      // errors to the loaded row's tier. A subclass that overrides one of them
      // silently leaves that audited path, which is the drift this base exists to
      // prevent. Entity-specific behavior belongs in the beforeCreate,
      // beforeUpdate and performDelete hooks, which run inside the sequence.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "ClassDeclaration[superClass.name='ContentCrudService'] > ClassBody > MethodDefinition[key.name=/^(create|update|remove|findWritableRow)$/]",
          message:
            'Do not override the ContentCrudService authorization skeleton (create/update/remove/findWritableRow). Override beforeCreate, beforeUpdate or performDelete instead.',
        },
      ],
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
);
