import { registerAs } from '@nestjs/config';

/** The dev database `docker compose` starts. `prisma.config.ts` repeats this literal. */
export const DEFAULT_DATABASE_URL = 'postgresql://grimoire:grimoire@localhost:5432/grimoire_os';

/**
 * The database block on its own, so PrismaModule can load it without the
 * app-wide configuration, which throws when JWT_SECRET is unset.
 */
export default registerAs('database', () => ({
  url: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
}));
