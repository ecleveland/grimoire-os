import { INestApplicationContext, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

const logger = new Logger('RunSeed');

/**
 * Seeds the database once. A failure is logged and sets exit code 1 instead of
 * throwing, so the compose seed service exits non-zero and the backend never
 * starts. The context is closed on both paths, which releases the pg pool and
 * lets the process exit.
 */
export async function runSeed(): Promise<void> {
  let app: INestApplicationContext | undefined;
  try {
    app = await NestFactory.createApplicationContext(SeedModule);
    await app.get(SeedService).seed();
  } catch (error) {
    logger.error('Seed failed', error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}

// Runs only as the entry point, `node dist/seed/run-seed.js` or `npm run seed`,
// so importing the module in a test starts nothing.
if (require.main === module) {
  void runSeed();
}
