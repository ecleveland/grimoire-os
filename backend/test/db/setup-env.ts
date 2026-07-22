// jest `setupFiles`: runs in every worker BEFORE the test module (and thus
// PrismaService / configuration) is imported, so the real-DB tests connect to a
// disposable test database — never the dev (`grimoire_os`) or Playwright
// (`grimoire_os_e2e`) database. globalSetup runs in the parent process and its
// env mutations do not propagate to workers, so the URL is re-derived here from
// the same inherited `TEST_DATABASE_URL` (or the same local default).
import { resolveTestDatabaseUrl } from './test-db-env';

process.env.DATABASE_URL = resolveTestDatabaseUrl();
// configuration.ts throws if JWT_SECRET is unset; the seed never issues tokens,
// so any non-empty value works for these tests.
process.env.JWT_SECRET ??= 'db-test-secret';
process.env.NODE_ENV ??= 'test';
