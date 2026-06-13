import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function registerPlayer(page: Page): Promise<{ username: string; password: string }> {
  const username = `refresh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'TestPass1!';
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password, displayName: 'Refresh User' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
  return { username, password };
}

test.describe('Refresh token flow', () => {
  test('register sets both access_token and refresh_token cookies', async ({ page }) => {
    await registerPlayer(page);
    const cookies = await page.context().cookies();
    const access = cookies.find(c => c.name === 'access_token');
    const refresh = cookies.find(c => c.name === 'refresh_token');
    expect(access, 'access_token cookie missing').toBeDefined();
    expect(refresh, 'refresh_token cookie missing').toBeDefined();
    expect(access?.httpOnly).toBe(true);
    expect(refresh?.httpOnly).toBe(true);
  });

  test('expired access cookie auto-refreshes via /auth/refresh on the next API call', async ({
    page,
  }) => {
    await registerPlayer(page);

    // Sanity: an authenticated /users/me works with both cookies present.
    const before = await page.request.get(`${BACKEND}/api/users/me`);
    expect(before.status()).toBe(200);

    // Simulate the access token expiring while the refresh token is still
    // valid. We delete only the access cookie — Playwright preserves the rest.
    const allCookies = await page.context().cookies();
    const refreshOnly = allCookies.filter(c => c.name !== 'access_token');
    await page.context().clearCookies();
    await page.context().addCookies(refreshOnly);

    // Without an access token, a direct /users/me from the page request would
    // 401. The frontend's auth-context hydration should refresh transparently
    // — exercise it by loading the home page and asserting the nav reflects
    // a logged-in state.
    await page.goto('/');

    // Assert the *settled* logged-in state: the real display name resolves only
    // after /auth/refresh succeeds and the retried /users/me returns 200. (The
    // Logout button is no longer a proxy for "refresh completed" — it now appears
    // during hydration from the session_present chrome hint, VEG-339.)
    await expect(page.getByRole('link', { name: 'Refresh User' })).toBeVisible({ timeout: 10_000 });

    // A fresh access_token cookie must have been re-issued by the refresh. Poll
    // rather than reading once — the cookie lands when /auth/refresh resolves.
    await expect
      .poll(async () => (await page.context().cookies()).some(c => c.name === 'access_token'), {
        timeout: 10_000,
      })
      .toBe(true);
  });

  test('refresh endpoint rotates the refresh token (old one is invalid after use)', async ({
    page,
  }) => {
    await registerPlayer(page);

    const firstCookies = await page.context().cookies();
    const firstRefresh = firstCookies.find(c => c.name === 'refresh_token')?.value;
    expect(firstRefresh).toBeTruthy();

    // First refresh succeeds and rotates the token.
    const refresh1 = await page.request.post(`${BACKEND}/api/auth/refresh`);
    expect(refresh1.status()).toBe(200);

    const rotatedCookies = await page.context().cookies();
    const rotatedRefresh = rotatedCookies.find(c => c.name === 'refresh_token')?.value;
    expect(rotatedRefresh).toBeTruthy();
    expect(rotatedRefresh).not.toBe(firstRefresh);

    // Re-presenting the original refresh token (reuse detection) must fail.
    // The browser already has the rotated cookie, so we send a raw request
    // with the original token as the Cookie header.
    const reused = await page.request.post(`${BACKEND}/api/auth/refresh`, {
      headers: { Cookie: `refresh_token=${firstRefresh}` },
    });
    expect(reused.status()).toBe(401);
  });

  test('logout revokes the refresh token (subsequent refresh is rejected)', async ({ page }) => {
    await registerPlayer(page);
    const cookies = await page.context().cookies();
    const refreshValue = cookies.find(c => c.name === 'refresh_token')?.value;
    expect(refreshValue).toBeTruthy();

    const logout = await page.request.post(`${BACKEND}/api/auth/logout`);
    expect(logout.status()).toBe(204);

    // Even with the captured refresh value, the server has revoked the row.
    const refresh = await page.request.post(`${BACKEND}/api/auth/refresh`, {
      headers: { Cookie: `refresh_token=${refreshValue}` },
    });
    expect(refresh.status()).toBe(401);
  });
});
