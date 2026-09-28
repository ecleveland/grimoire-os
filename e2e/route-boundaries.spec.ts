import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { BACKEND, registerAndLogin } from './helpers';

// App router boundaries (VEG-541): unknown routes land on the root not-found
// page, and a campaign id that does not exist keeps the app shell up.
test.describe('route boundaries (VEG-541)', () => {
  test('an unknown route renders the not-found page with a 404', async ({ page }) => {
    // The auth middleware sends anonymous visitors to /login, so sign in first.
    await registerAndLogin(page, 'notfound', 'E2E Not Found');
    const response = await page.goto('/this-route-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();

    await page.getByRole('link', { name: /go home/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('a nonexistent campaign id keeps the header and reports not found', async ({ page }) => {
    await registerAndLogin(page, 'boundary', 'E2E Boundary DM');
    const missingId = randomUUID();

    const apiRes = await page.request.get(`${BACKEND}/api/campaigns/${missingId}`);
    expect(apiRes.status()).toBe(404);

    await page.goto(`/campaigns/${missingId}`);
    await expect(page.getByText('Campaign not found.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'GrimoireOS' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: /hit an error/i })).toHaveCount(0);
  });
});
