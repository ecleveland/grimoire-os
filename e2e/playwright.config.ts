import { defineConfig, devices } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// E2E runs against a dedicated database on dedicated ports so it cannot
// pollute the dev DB or collide with a running dev.sh. Each checkout gets its
// own stack: the main checkout uses grimoire_os_e2e on 3010/3011, a linked
// worktree gets a private database and port pair. stack-env.sh holds those
// rules; running it here keeps this config, dev-e2e.sh and global-setup.ts on
// the same stack. Values already in the environment win.
//
// Specs read process.env.E2E_API_URL / E2E_BASE_URL directly at module load.
// Set defaults here so a single source of truth governs which ports the suite
// targets — no spec-by-spec hardcoded fallbacks to drift out of sync.
const stackEnv = execFileSync(
  'bash',
  [path.join(__dirname, 'stack-env.sh'), path.resolve(__dirname, '..')],
  { encoding: 'utf8' }
);
for (const line of stackEnv.trim().split('\n')) {
  const eq = line.indexOf('=');
  process.env[line.slice(0, eq)] = line.slice(eq + 1);
}
process.env.E2E_BASE_URL ??= `http://localhost:${process.env.E2E_FRONTEND_PORT}`;
process.env.E2E_API_URL ??= `http://localhost:${process.env.E2E_BACKEND_PORT}`;

const FRONTEND_URL = process.env.E2E_BASE_URL;
const BACKEND_URL = process.env.E2E_API_URL;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  globalSetup: require.resolve('./global-setup.ts'),
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_NO_WEBSERVER
    ? undefined
    : {
        command: './dev-e2e.sh',
        cwd: '..',
        url: FRONTEND_URL,
        // Locally, reuse an already-running dev-e2e.sh stack; in CI a stale
        // server can't exist, so treat one as an error per Playwright docs.
        reuseExistingServer: !process.env.CI,
        // CI cold-starts the whole stack (postgres, migrate, seed, two dev
        // servers); allow more headroom than the warm local path needs.
        timeout: process.env.CI ? 300_000 : 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
        // dev-e2e.sh runs backend and frontend in their own process groups
        // and stops them from its exit trap. The default SIGKILL of the
        // script's group would skip that trap and orphan both servers.
        gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
      },
  metadata: { backendUrl: BACKEND_URL },
});
