import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function registerPlayer(page: Page): Promise<void> {
  const username = `dead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'Dead Session User' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

test.describe('Dead session recovery (VEG-419)', () => {
  test('a present-but-invalid access cookie lands on an interactive /login without looping', async ({
    page,
  }) => {
    await registerPlayer(page);

    // Reproduce the wedge precondition: the access_token cookie is physically
    // present but no longer represents a valid session, AND there is no usable
    // refresh token, so /auth/refresh cannot restore it. The session_present
    // cookie still says "a session existed". This is the exact state where the
    // middleware (presence-only) and the client (validity) disagreed and the
    // app bounced / ↔ /login forever.
    const cookies = await page.context().cookies();
    const access = cookies.find(c => c.name === 'access_token');
    const sessionPresent = cookies.find(c => c.name === 'session_present');
    expect(access, 'access_token cookie missing').toBeDefined();
    expect(sessionPresent, 'session_present cookie missing').toBeDefined();

    await page.context().clearCookies();
    await page.context().addCookies([
      { ...access!, value: 'dead.invalid.token' }, // structurally present, not a valid JWT
      sessionPresent!,
    ]);

    // Record every main-frame navigation so we can prove the page settles
    // instead of oscillating /-↔-/login.
    const visited: string[] = [];
    page.on('framenavigated', frame => {
      if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
    });

    await page.goto('/');

    // It must settle on /login with an interactive sign-in form.
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
    const signIn = page.getByRole('button', { name: 'Sign in' });
    await expect(signIn).toBeVisible();
    await expect(signIn).toBeEnabled();

    // The stale access cookie must have been cleared server-side via the
    // logout cleanup — that's what stops the middleware bouncing /login back to /.
    await expect
      .poll(async () => (await page.context().cookies()).some(c => c.name === 'access_token'), {
        timeout: 10_000,
      })
      .toBe(false);

    // No loop: the URL stays put once settled...
    await page.waitForTimeout(1_500);
    await expect(page).toHaveURL(/\/login$/);
    await expect(signIn).toBeEnabled();

    // ...and we never bounced back onto a protected route after reaching /login.
    const loginIndex = visited.indexOf('/login');
    expect(loginIndex, 'never reached /login').toBeGreaterThanOrEqual(0);
    const afterLogin = visited.slice(loginIndex + 1);
    expect(afterLogin, `oscillated after /login: ${visited.join(' -> ')}`).not.toContain('/');
  });
});
