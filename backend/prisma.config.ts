// The Prisma CLI reads its schema, migrations and connection URL from here and
// no longer loads .env itself. process.env rather than Prisma's env() helper,
// because env() throws when the variable is unset and `prisma generate` runs
// without a database URL in the Docker build and in CI.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Same default as DEFAULT_DATABASE_URL in src/config/database.config.ts, so the
// CLI and the app agree when .env is missing. Repeated rather than imported
// because the production image ships dist/ without src/.
const DEFAULT_DATABASE_URL = 'postgresql://grimoire:grimoire@localhost:5432/grimoire_os';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node -r tsconfig-paths/register src/seed/run-seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL || DEFAULT_DATABASE_URL,
  },
});
