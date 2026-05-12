import { expect, test } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function registerPlayer(request: import('@playwright/test').APIRequestContext) {
  const username = `player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'TestPass1!';
  const reg = await request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password, displayName: 'E2E Player' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
  const { access_token: token } = await reg.json();
  return token;
}

async function injectAuth(page: import('@playwright/test').Page, token: string) {
  await page.goto('/login');
  await page.evaluate(t => {
    localStorage.setItem('token', t);
    const payload = JSON.parse(atob(t.split('.')[1]));
    localStorage.setItem(
      'user',
      JSON.stringify({ userId: payload.sub, username: payload.username, role: payload.role })
    );
    document.cookie = 'auth-flag=1; path=/; SameSite=Lax';
  }, token);
}

test.describe('Admin NPC Reference Data', () => {
  test('non-admin users are redirected away from /admin/npc-data', async ({ page, request }) => {
    const token = await registerPlayer(request);
    await injectAuth(page, token);

    await page.goto('/admin/npc-data');

    // Non-admin gets bounced back to the dashboard ("/").
    await page.waitForURL(/\/$|\/dashboard/, { timeout: 10_000 });

    // Backend should also refuse the request directly.
    const direct = await request.get(`${BACKEND}/api/admin/npc-data/names`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(direct.status()).toBe(403);
  });
});
