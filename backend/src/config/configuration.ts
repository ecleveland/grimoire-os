import { resolveCookieSecure } from './cookie.config';
import databaseConfig from './database.config';

export default () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable must be set');
  }

  return {
    port: parseInt(process.env.PORT ?? '3001', 10),
    database: databaseConfig(),
    auth: {
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
      refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
      refreshRotationGraceMs: 3_000,
      // Resolved here so a bad COOKIE_SECURE value stops the boot.
      cookieSecure: resolveCookieSecure(),
    },
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    },
  };
};
