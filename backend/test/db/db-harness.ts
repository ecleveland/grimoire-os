// Reusable real-DB test seam (VEG-484). Any seed/DB regression spec builds a Nest
// application context around SeedModule to get a live PrismaService + SeedService,
// optionally resets the schema with truncateAll(), then asserts. The default unit
// suite never touches these files: they live outside `src/` (jest rootDir) and use
// the `.db-spec.ts` suffix, which the default `.*\.spec\.ts$` regex does not match.
import { readFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { SeedModule } from '../../src/seed/seed.module';
import { SeedService } from '../../src/seed/seed.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertTestDatabaseUrl } from './test-db-env';

export interface SeedContext {
  app: INestApplicationContext;
  prisma: PrismaService;
  seed: SeedService;
}

/** Boot a Nest context wired to the test database and expose Prisma + the seeder. */
export async function createSeedContext(): Promise<SeedContext> {
  guardTestDatabase();
  const app = await NestFactory.createApplicationContext(SeedModule, { logger: false });
  return { app, prisma: app.get(PrismaService), seed: app.get(SeedService) };
}

export async function teardownSeedContext(ctx: SeedContext): Promise<void> {
  await ctx.app.close();
}

/**
 * TRUNCATE every public table (except the migrations bookkeeping) so a spec
 * starts from an empty schema regardless of prior runs. RESTART IDENTITY CASCADE
 * clears sequences and dependent rows in one statement.
 */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(t => `"public"."${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

// Second line of defence behind global-setup's guard: truncateAll is destructive,
// so refuse to run against anything but a clearly-named test database.
function guardTestDatabase(): void {
  assertTestDatabaseUrl(process.env.DATABASE_URL ?? '');
}

/**
 * Replay a migration's real SQL against the test database.
 *
 * Migration-shaped fixes cannot be proved through the mocked unit suite: the
 * defect is always a property of rows that are already persisted. Two specs
 * (VEG-493's proficiency normalisation, VEG-528's classId backfill) each carried
 * a verbatim copy of this, which put a known-fragile SQL splitter in two places
 * at once, so it lives here with the other seams instead.
 *
 * `$executeRawUnsafe` sends one prepared statement per call and Postgres refuses
 * multiple commands in one, so the file is replayed statement by statement.
 * Comment lines are stripped first because they contain apostrophes ("Thieves'
 * Tools") that would otherwise look like string delimiters to the split.
 *
 * Known limits, and why they are tolerable here: the split is naive on `;`, so a
 * semicolon inside a string literal or a `$$`-quoted body would break it, and
 * only whole-line `--` comments are stripped. Every migration replayed so far is
 * plain DML. Harden this, in one place, when one is not.
 */
export async function applyMigration(prisma: PrismaService, migrationDir: string): Promise<void> {
  const sql = readFileSync(
    join(__dirname, '../../prisma/migrations', migrationDir, 'migration.sql'),
    'utf8'
  );
  const statements = sql
    .split('\n')
    .filter(line => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => statement.length > 0);
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
