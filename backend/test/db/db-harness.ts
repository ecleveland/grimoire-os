// Reusable real-DB test seam (VEG-484). Any seed/DB regression spec builds a Nest
// application context around SeedModule to get a live PrismaService + SeedService,
// optionally resets the schema with truncateAll(), then asserts. The default unit
// suite never touches these files: they live outside `src/` (jest rootDir) and use
// the `.db-spec.ts` suffix, which the default `.*\.spec\.ts$` regex does not match.
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
