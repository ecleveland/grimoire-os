import { defineConfig, devices } from '@playwright/test';

// E2E runs against a dedicated database (grimoire_os_e2e) on dedicated ports
// (3010/3011) so it cannot pollute the dev DB or collide with a running dev.sh.
// See dev-e2e.sh and global-setup.ts.
//
// Specs read process.env.E2E_API_URL / E2E_BASE_URL directly at module load.
// Set defaults here so a single source of truth governs which ports the suite
// targets — no spec-by-spec hardcoded fallbacks to drift out of sync.
process.env.E2E_BASE_URL ??= 'http://localhost:3011';
process.env.E2E_API_URL ??= 'http://localhost:3010';

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
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },
  metadata: { backendUrl: BACKEND_URL },
});
