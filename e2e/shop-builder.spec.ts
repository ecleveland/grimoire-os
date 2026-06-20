import { test, expect } from '@playwright/test';
import { BACKEND, registerAndLogin, csrfHeaders } from './helpers';

// VEG-354 — DM shop builder golden path: create a shop with a custom line item
// through the UI, then confirm it renders on the themed storefront.
test.describe('Shop builder', () => {
  test('DM creates a shop with a custom line and sees it on the storefront', async ({ page }) => {
    await registerAndLogin(page, 'shop-builder-dm');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Builder Camp ${Date.now()}` },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    // Open the builder from the storefront's New Shop affordance.
    await page.goto(`/campaigns/${campaignId}/shops/new`);
    await expect(page.getByRole('heading', { name: /new shop/i })).toBeVisible();

    await page.getByLabel(/^name/i).fill('The Prancing Pony');
    await page.getByLabel(/^theme/i).selectOption('tavern');
    await page.getByLabel(/^description/i).fill('A warm hearth and cold ale.');

    // Add a custom (non-catalog) line and price it.
    await page.getByRole('button', { name: /add custom line/i }).click();
    await page.getByLabel(/line 1 name/i).fill('Mug of ale');
    await page.getByLabel(/line 1 cp/i).fill('4');

    await page.getByRole('button', { name: /create shop/i }).click();

    // Lands on the themed storefront detail with the line + formatted price.
    await expect(page.getByRole('heading', { name: 'The Prancing Pony' })).toBeVisible();
    await expect(page.getByText('Mug of ale')).toBeVisible();
    await expect(page.getByText('4 cp')).toBeVisible();

    // Owner can re-enter the builder to manage it.
    await expect(page.getByRole('link', { name: /manage/i })).toBeVisible();
  });
});
