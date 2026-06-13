import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function registerPlayer(page: Page): Promise<void> {
  const username = `chrome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'Chrome User' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

// Settled-state auth chrome (VEG-339). VEG-339 reworked the Header and the SRD
// "Create" buttons to reserve space while a session hydrates, but the settled
// behavior must be unchanged: an authenticated user sees the nav and the Create
// button; an anonymous visitor on a public SRD page sees neither, while the
// page content itself still renders. (The transient hydration skeleton is
// timing-dependent and covered by unit tests, not asserted here.)
test.describe('auth-gated chrome — settled state (VEG-339)', () => {
  test('authenticated user sees the nav and the Create button on /srd/monsters', async ({
    page,
  }) => {
    await registerPlayer(page);
    await page.goto('/srd/monsters');

    // Header nav (only rendered for authenticated users).
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Campaigns' })).toBeVisible();
    // The page's own Create affordance.
    await expect(page.getByRole('link', { name: 'Create monster' })).toBeVisible();
  });

  test('anonymous visitor sees the SRD content but no authed chrome', async ({ page }) => {
    // No registration — fully anonymous.
    await page.goto('/srd/monsters');

    // The public SRD content renders...
    await expect(page.getByRole('heading', { name: 'Monsters' })).toBeVisible({ timeout: 10_000 });
    // ...but none of the authed chrome appears (and never flashes in: give the
    // hydration window time to settle before asserting absence).
    await expect(page.getByRole('button', { name: 'Logout' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Create monster' })).toHaveCount(0);
  });
});
