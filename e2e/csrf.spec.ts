import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function registerPlayer(page: Page): Promise<{ username: string; password: string }> {
  const username = `csrf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'TestPass1!';
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password, displayName: 'CSRF User' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
  return { username, password };
}

test.describe('CSRF double-submit cookie', () => {
  test('register issues a non-httpOnly csrf_token cookie', async ({ page }) => {
    await registerPlayer(page);

    const csrf = (await page.context().cookies()).find(c => c.name === 'csrf_token');
    expect(csrf, 'csrf_token cookie missing after register').toBeDefined();
    // JS must be able to read the cookie to attach the matching header.
    expect(csrf?.httpOnly).toBe(false);
    expect(csrf?.value.length).toBeGreaterThan(0);
  });

  test('a mutating request without the x-csrf-token header is rejected with 403', async ({
    page,
  }) => {
    await registerPlayer(page);

    // Authenticated POST to a protected endpoint without the header should 403.
    // /api/campaigns is a mutating endpoint that requires auth — the access
    // cookie carries auth, but the missing CSRF header should be the failure.
    const noHeader = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: 'Should be blocked' },
    });
    expect(noHeader.status()).toBe(403);
  });

  test('the same request with x-csrf-token=csrf_token cookie succeeds', async ({ page }) => {
    await registerPlayer(page);

    const csrfValue = (await page.context().cookies()).find(c => c.name === 'csrf_token')?.value;
    expect(csrfValue).toBeTruthy();

    const withHeader = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: 'Permitted by CSRF token' },
      headers: { 'x-csrf-token': csrfValue! },
    });
    // 201 created or 200 — anything below 400 means CSRF gate let it through.
    expect(withHeader.status()).toBeLessThan(400);
  });

  test('a mismatched x-csrf-token header is rejected with 403', async ({ page }) => {
    await registerPlayer(page);

    const mismatch = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: 'Mismatched token' },
      headers: { 'x-csrf-token': 'not-the-real-token' },
    });
    expect(mismatch.status()).toBe(403);
  });

  test('safe GET requests do not require the CSRF header', async ({ page }) => {
    await registerPlayer(page);

    const me = await page.request.get(`${BACKEND}/api/users/me`);
    expect(me.status()).toBe(200);
  });
});
