import { test, expect } from '@playwright/test';
import { BACKEND, registerAndLogin, csrfHeaders } from './helpers';

// VEG-356 — player storefront golden path. The DM-builder UI (VEG-354) doesn't
// exist yet, so the shop is seeded via the VEG-353 API; this spec covers the
// member-facing browse view: Shops tab → themed shop detail with prices + stock.
test.describe('Shop storefront', () => {
  test('owner browses a seeded shop from the Shops tab to its themed detail', async ({ page }) => {
    await registerAndLogin(page, 'shop-dm');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Shop Camp ${Date.now()}` },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    const shopRes = await page.request.post(`${BACKEND}/api/shops`, {
      data: {
        campaignId,
        name: "Maelin's Apothecary",
        theme: 'alchemist',
        description: 'A cramped shop reeking of sulfur.',
        items: [
          { name: 'Potion of Healing', category: 'Potion', price: { gp: 50 }, stock: 5 },
          { name: 'Torch', price: { cp: 1 }, stock: null },
        ],
      },
      headers,
    });
    expect(shopRes.ok(), `shop create failed: ${shopRes.status()}`).toBeTruthy();

    // Open the campaign and switch to the Shops tab.
    await page.goto(`/campaigns/${campaignId}`);
    await page.getByRole('button', { name: /^shops$/i }).click();

    // The storefront lists the shop; open it.
    await page.getByRole('link', { name: /maelin’s apothecary|maelin's apothecary/i }).click();

    // Themed detail shows the name, a formatted price, and stock status.
    await expect(page.getByRole('heading', { name: /maelin/i })).toBeVisible();
    await expect(page.getByText('Potion of Healing')).toBeVisible();
    await expect(page.getByText('50 gp')).toBeVisible();
    await expect(page.getByText('5 left')).toBeVisible();
    await expect(page.getByText('Unlimited')).toBeVisible();

    // The owner gets a Manage entry point into the builder.
    await expect(page.getByRole('link', { name: /manage/i })).toBeVisible();
  });
});
