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

async function registerPlayer(page: Page): Promise<void> {
  await register(page, 'player');
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

test.describe('Admin NPC Reference Data', () => {
  test('non-admin users are redirected away from /admin/npc-data', async ({ page }) => {
    await registerPlayer(page);

    await page.goto('/admin/npc-data');

    // Non-admin gets bounced back to the dashboard ("/").
    await page.waitForURL(/\/$|\/dashboard/, { timeout: 10_000 });

    // Backend should also refuse the request directly. page.request shares
    // cookies with the page context, so the auth cookie is carried over.
    const direct = await page.request.get(`${BACKEND}/api/admin/npc-data/names`);
    expect(direct.status()).toBe(403);
  });

  test('admin creates a loot template with the structured editors, then deletes it', async ({
    page,
  }) => {
    await registerAdmin(page);
    const profession = `e2e-merchant-${Date.now()}`;

    await page.goto('/admin/npc-data');
    await page.getByRole('tab', { name: 'Loot Templates' }).click();

    // Structured controls replace the raw-JSON textareas (VEG-303).
    await expect(page.getByLabel('gp min')).toBeVisible();
    await expect(page.locator('textarea')).toHaveCount(0);

    await page.getByLabel(/^Profession/).fill(profession);
    await page.getByLabel(/CR bucket/).selectOption('2–4');
    await page.getByLabel('gp max').fill('2');
    await page.getByLabel('sp max').fill('8');

    // Pick a real catalog item via the debounced search.
    await page.getByLabel('Search items').fill('dagger');
    await page.getByRole('button', { name: 'Add Dagger', exact: true }).click();
    await expect(page.getByLabel('Dagger weight')).toHaveValue('1');

    await page.getByRole('button', { name: 'Add row' }).click();

    // The new template lands in the table as a deletable user row.
    const row = page.getByRole('row', { name: new RegExp(profession) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('user');

    // Clean up through the UI — also covers delete on the loot tab.
    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('row', { name: new RegExp(profession) })).toHaveCount(0);
  });
});
