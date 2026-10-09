// Load backend/.env for standalone boots such as the NPC backfill, which import
// this config without ConfigModule.forRoot. dotenv never overrides a variable
// that is already set.
import 'dotenv/config';
import { registerAs } from '@nestjs/config';

/** The dev database `docker compose` starts. `prisma.config.ts` repeats this literal. */
export const DEFAULT_DATABASE_URL = 'postgresql://grimoire:grimoire@localhost:5432/grimoire_os';

/** What the pg pool's `ssl` option receives. Undefined leaves TLS off. */
export type DatabaseSsl = true | { rejectUnauthorized: false } | undefined;

/**
 * Prisma 6 semantics for `sslmode`, which pg reads differently. Prisma 6 treated
 * `require` and `prefer` as "encrypt, do not verify the chain"; pg 8 treats both
 * as full verification, which a managed provider's private CA fails.
 * `verify-ca` and `verify-full` ask for verification, so they get it.
 */
function sslFor(sslmode: string | null): DatabaseSsl {
  switch (sslmode) {
    case 'require':
    case 'prefer':
      return { rejectUnauthorized: false };
    case 'verify-ca':
    case 'verify-full':
      return true;
    default:
      return undefined;
  }
}

/**
 * The URL without its `sslmode` parameter. pg merges the parsed URL over the
 * pool options (`Object.assign({}, config, parse(connectionString))` in
 * pg/lib/connection-parameters.js, pg 8.23), so a URL sslmode would replace the
 * `ssl` option above. Every other parameter is left as written. A URL
 * `sslrootcert` or `sslcert` still makes pg build its own `ssl`, which follows libpq.
 */
function withoutSslMode(url: string): string {
  return url.replace(/([?&])sslmode=[^&#]*&?/, '$1').replace(/[?&](#|$)/, '$1');
}

/**
 * The database block on its own, so PrismaModule can load it without the
 * app-wide configuration, which throws when JWT_SECRET is unset.
 */
export default registerAs('database', () => {
  const raw = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;
  const sslmode = new URL(raw).searchParams.get('sslmode');
  return {
    url: sslmode === null ? raw : withoutSslMode(raw),
    ssl: sslFor(sslmode),
  };
});
