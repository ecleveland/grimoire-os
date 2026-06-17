import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';
const E2E_DB_NAME = process.env.E2E_DB_NAME ?? 'grimoire_os_e2e';
const PASSWORD = 'TestPass1!';

// Run a single SQL statement inside the compose postgres container (no host psql).
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

async function registerAdmin(page: Page): Promise<void> {
  const username = await register(page, 'admin');
  sql(`UPDATE users SET role = 'admin' WHERE username = '${username}'`);
  const login = await page.request.post(`${BACKEND}/api/auth/login`, {
    data: { username, password: PASSWORD },
  });
  expect(login.ok(), `admin re-login failed: ${login.status()}`).toBeTruthy();
}

test.describe('Admin Equipment & Items', () => {
  test('non-admin users are redirected away from /admin/equipment and refused by the API', async ({
    page,
  }) => {
    await register(page, 'player');

    await page.goto('/admin/equipment');
    await page.waitForURL(/\/$|\/dashboard/, { timeout: 10_000 });

    const direct = await page.request.get(`${BACKEND}/api/admin/items`);
    expect(direct.status()).toBe(403);
  });

  test('admin creates a shared equipment pack, edits its contents, then deletes it', async ({
    page,
  }) => {
    await registerAdmin(page);
    const packName = `E2E Pack ${Date.now()}`;

    await page.goto('/admin/equipment');

    // Create the pack via the shared item form.
    await page.getByRole('button', { name: 'New item' }).click();
    await page.getByLabel(/^Name/).fill(packName);
    await page.getByLabel(/^Category/).selectOption('Equipment Pack');
    await page.getByRole('button', { name: 'Create item' }).click();

    // It lands in the shared list.
    const row = page.getByRole('row', {
      name: new RegExp(packName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    });
    await expect(row).toBeVisible();

    // Edit its contents: pick a real catalog item via the debounced search.
    await row.getByRole('button', { name: 'Contents' }).click();
    const dialog = page.getByRole('dialog', {
      name: new RegExp(`contents of ${packName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'),
    });
    await dialog.getByLabel('Search items').fill('dagger');
    await dialog.getByRole('button', { name: 'Add Dagger', exact: true }).click();
    await expect(dialog.getByLabel('Dagger quantity')).toHaveValue('1');
    await dialog.getByRole('button', { name: 'Save contents' }).click();
    await expect(dialog).toHaveCount(0);

    // Clean up through the UI.
    await row.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(row).toHaveCount(0);
  });
});
