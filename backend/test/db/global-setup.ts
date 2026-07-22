// jest `globalSetup`: runs once in the parent process before any worker. It
// provisions the disposable test database (create-if-absent) and applies the
// Prisma migrations, so `npm run test:db` works from a bare Postgres with no
// manual createdb/migrate — locally (compose Postgres on 5432) and in CI (a
// `services: postgres` container).
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { assertTestDatabaseUrl, resolveTestDatabaseUrl } from './test-db-env';

export default async function globalSetup(): Promise<void> {
  const url = resolveTestDatabaseUrl();
  // Hard refusal: the test truncates + reseeds, which would destroy real data.
  const dbName = assertTestDatabaseUrl(url);

  // Create the database if it does not exist yet, by connecting to the always-
  // present `postgres` maintenance database. CREATE DATABASE cannot run inside a
  // transaction, so it goes through $executeRawUnsafe.
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    const existing = await admin.$queryRawUnsafe<Array<{ exists: number }>>(
      'SELECT 1 AS exists FROM pg_database WHERE datname = $1',
      dbName
    );
    if (existing.length === 0) {
      // dbName is validated to contain "test" above; it originates from our own
      // env, not user input, so interpolation here is safe.
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
