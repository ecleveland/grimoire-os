import { expect, test, type Page } from '@playwright/test';
import { BACKEND, createCampaign, escapeRegExp } from './helpers';

// The middleware carries the requested path through /login as the next query
// parameter, and signing in returns the user there. Only a same-origin relative
// path is honoured, so an off-origin next falls back to /.

const PASSWORD = 'TestPass1!';

// Register through page.request so the Set-Cookie authenticates the context,
// and keep the credentials so the login form can use them later.
async function registerPlayer(page: Page): Promise<string> {
  const username = `deeplink-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: PASSWORD, displayName: 'E2E Deep Link' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
  return username;
}

async function signIn(page: Page, username: string): Promise<void> {
  await page.locator('input[type="text"]').fill(username);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe('Deep links survive login (VEG-571)', () => {
  test('a signed-out visit to a campaign page comes back to it after signing in', async ({
    page,
  }) => {
    const username = await registerPlayer(page);
    const campaignId = await createCampaign(page, 'DeepLink');
    await page.context().clearCookies();

    const campaignPath = `/campaigns/${campaignId}`;
    await page.goto(campaignPath);

    await expect(page).toHaveURL(
      new RegExp(`/login\\?next=${escapeRegExp(encodeURIComponent(campaignPath))}$`),
      { timeout: 10_000 }
    );
    const loginUrl = new URL(page.url());
    expect(loginUrl.pathname).toBe('/login');
    expect(loginUrl.searchParams.get('next')).toBe(campaignPath);

    await signIn(page, username);

    await expect(page).toHaveURL(new RegExp(`/campaigns/${escapeRegExp(campaignId)}$`), {
      timeout: 10_000,
    });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
  });

  test('an off-origin next falls back to /', async ({ page }) => {
    const username = await registerPlayer(page);
    await page.context().clearCookies();

    await page.goto('/login?next=https%3A%2F%2Fevil.com');
    await signIn(page, username);

    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    const landed = new URL(page.url());
    expect(landed.hostname).not.toBe('evil.com');
    expect(landed.pathname).toBe('/');
  });
});
