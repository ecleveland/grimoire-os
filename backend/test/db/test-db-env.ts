// Single source of truth for the real-DB test target (VEG-484), shared by the
// jest setupFile, globalSetup, and the harness so the default URL and the
// destructive-guard rule can never drift between them.
export const DEFAULT_TEST_DATABASE_URL =
  'postgresql://grimoire:grimoire@localhost:5432/grimoire_os_seedtest';

/** The configured test database URL, or the local default. */
export function resolveTestDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
}

/**
 * Throw unless `url` names a database whose name contains "test". The seed tests
 * TRUNCATE and re-seed, so this is the guard that keeps them off the dev
 * (`grimoire_os`) and Playwright (`grimoire_os_e2e`) databases. Returns the
 * validated database name.
 */
export function assertTestDatabaseUrl(url: string): string {
  const dbName = url ? new URL(url).pathname.replace(/^\//, '') : '';
  if (!dbName.includes('test')) {
    throw new Error(
      `Refusing to run seed DB tests against non-test database "${dbName}". ` +
        'Point TEST_DATABASE_URL at a database whose name contains "test".'
    );
  }
  return dbName;
}
