import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';
const E2E_DB_NAME = process.env.E2E_DB_NAME ?? 'grimoire_os_e2e';
const PASSWORD = 'TestPass1!';

// Run a single SQL statement inside the compose postgres container — the same
// path global-setup.ts uses, so no host-side psql client is needed.
function sql(query: string): string {
  const repoRoot = path.resolve(__dirname, '..');
  const cmd = [
    'docker compose',
    '-f',
    `"${path.join(repoRoot, 'docker-compose.yml')}"`,
    'exec -T postgres',
    'psql -U grimoire',
    `-d ${E2E_DB_NAME}`,
    '-tA -v ON_ERROR_STOP=1',
    `-c "${query}"`,
  ].join(' ');
  return execSync(cmd, { stdio: 'pipe' }).toString().trim();
}

async function register(page: Page, prefix: string): Promise<string> {
  const username = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: PASSWORD, displayName: `E2E ${prefix}` },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
  return username;
}

// Promote a freshly registered user to admin directly in the DB (no
// admin-creation endpoint exists), then re-login so the JWT carries the role.
async function registerAdmin(page: Page): Promise<void> {
  const username = await register(page, 'admin');
  sql(`UPDATE users SET role = 'admin' WHERE username = '${username}'`);
  const login = await page.request.post(`${BACKEND}/api/auth/login`, {
    data: { username, password: PASSWORD },
  });
  expect(login.ok(), `admin re-login failed: ${login.status()}`).toBeTruthy();
}

test.describe('Admin Loot Odds', () => {
  test('non-admin users are redirected away from /admin/loot-odds', async ({ page }) => {
    await register(page, 'player');

    await page.goto('/admin/loot-odds');
    await page.waitForURL(/\/$|\/dashboard/, { timeout: 10_000 });

    // Backend refuses the request directly too (shared cookies carry the auth).
    const direct = await page.request.get(`${BACKEND}/api/admin/loot-odds`);
    expect(direct.status()).toBe(403);
  });

  test('admin edits the coinage multiplier and the change persists', async ({ page }) => {
    await registerAdmin(page);
    // The shared e2e DB is reused across specs, so restore the seeded value
    // afterward — other loot specs read these global rules.
    sql(
      "UPDATE game_rules SET value = '1' WHERE category = 'npc-generation' AND key = 'coinage-multiplier'"
    );

    try {
      await page.goto('/admin/loot-odds');

      // Seeded fractions render as percentages (trinket 0.05 → 5%).
      await expect(page.getByLabel('Trinket Chance (%)')).toHaveValue('5');
      const multiplier = page.getByLabel('Coinage Multiplier');
      await expect(multiplier).toHaveValue('1');

      await multiplier.fill('2');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByText('Loot odds saved')).toBeVisible();

      // Reload: the persisted value comes back from the API.
      await page.reload();
      await expect(page.getByLabel('Coinage Multiplier')).toHaveValue('2');

      // And it landed as a plain number in the GameRule row.
      const stored = sql(
        "SELECT value FROM game_rules WHERE category = 'npc-generation' AND key = 'coinage-multiplier'"
      );
      expect(stored).toBe('2');
    } finally {
      sql(
        "UPDATE game_rules SET value = '1' WHERE category = 'npc-generation' AND key = 'coinage-multiplier'"
      );
    }
  });
});
