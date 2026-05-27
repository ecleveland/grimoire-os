import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function registerPlayer(page: Page): Promise<void> {
  const username = `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'TestPass1!';
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password, displayName: 'E2E Player' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
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
});
