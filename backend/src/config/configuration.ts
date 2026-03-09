export default () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable must be set');
  }

  return {
    port: parseInt(process.env.PORT ?? '3001', 10),
    database: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/grimoire-os',
    },
    auth: {
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
    },
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    },
  };
};
