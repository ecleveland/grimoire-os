// @ts-check
import nextConfig from 'eslint-config-next';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.Config[]} */
const config = [
  ...nextConfig,
  {
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Pre-existing fetch-in-effect and hydration patterns trip this rule.
      // They are scheduled to be restructured by VEG-319 (TanStack Query) and
      // VEG-320 (auth/SRD refactor); ratchet back to 'error' once those land.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];

export default config;
