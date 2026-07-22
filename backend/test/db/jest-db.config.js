// Dedicated Jest project for real-DB tests (VEG-484). Kept separate from the
// inline `jest` config in package.json so DB tests never run in the coverage-
// gated, no-Postgres Backend CI job: different testMatch, no coverage, a
// globalSetup that provisions the test database, and serial execution (one
// shared database). Run via `npm run test:db`.
module.exports = {
  rootDir: '../..', // backend/
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/db/**/*.db-spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  setupFiles: ['<rootDir>/test/db/setup-env.ts'],
  globalSetup: '<rootDir>/test/db/global-setup.ts',
  maxWorkers: 1,
  testTimeout: 180000,
};
