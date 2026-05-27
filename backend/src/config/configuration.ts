export default () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable must be set');
  }

  return {
    port: parseInt(process.env.PORT ?? '3001', 10),
    database: {
      url: process.env.DATABASE_URL || 'postgresql://grimoire:grimoire@localhost:5432/grimoire_os',
    },
    auth: {
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
      refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
    },
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    },
  };
};
