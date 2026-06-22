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

  // VEG-442 — closed shops are hidden from non-owner members server-side, not
  // just in the UI. A joined player must never see a closed shop in the list nor
  // be able to read it by id (404, not 403, so existence isn't leaked).
  test('a player sees only open shops; a closed shop is hidden and 404s by id', async ({
    page,
    browser,
  }) => {
    await registerAndLogin(page, 'shop-dm-closed');
    const dmHeaders = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Closed Shop Camp ${Date.now()}` },
      headers: dmHeaders,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    const inviteRes = await page.request.post(
      `${BACKEND}/api/campaigns/${campaignId}/invite-code`,
      { headers: dmHeaders }
    );
    expect(inviteRes.ok(), `invite code failed: ${inviteRes.status()}`).toBeTruthy();
    const inviteCode = (await inviteRes.json()).inviteCode as string;

    // One open, one closed (secret vendor) shop.
    const openRes = await page.request.post(`${BACKEND}/api/shops`, {
      data: { campaignId, name: 'The Open Market', theme: 'general-goods', isOpen: true },
      headers: dmHeaders,
    });
    expect(openRes.ok(), `open shop create failed: ${openRes.status()}`).toBeTruthy();
    const closedRes = await page.request.post(`${BACKEND}/api/shops`, {
      data: { campaignId, name: 'The Hidden Cellar', theme: 'black-market', isOpen: false },
      headers: dmHeaders,
    });
    expect(closedRes.ok(), `closed shop create failed: ${closedRes.status()}`).toBeTruthy();
    const closedShopId = (await closedRes.json()).id as string;

    // A second user joins as a player.
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await registerAndLogin(playerPage, 'shop-player', 'E2E Shop Player');
    await playerPage.goto('/campaigns/join');
    await playerPage.getByLabel(/invite code/i).fill(inviteCode);
    await playerPage.getByRole('button', { name: /join campaign/i }).click();
    await expect(playerPage).toHaveURL(new RegExp(`/campaigns/${campaignId}$`));

    // Storefront: the open shop shows, the closed one is absent.
    await playerPage.getByRole('button', { name: /^shops$/i }).click();
    await expect(playerPage.getByText('The Open Market')).toBeVisible();
    await expect(playerPage.getByText('The Hidden Cellar')).toHaveCount(0);

    // The access boundary is server-side, not cosmetic: the list payload omits the
    // closed shop, and fetching it by id is a 404 (not a 403 that confirms it exists).
    const playerHeaders = await csrfHeaders(playerPage);
    const listRes = await playerPage.request.get(`${BACKEND}/api/shops?campaignId=${campaignId}`, {
      headers: playerHeaders,
    });
    expect(listRes.ok()).toBeTruthy();
    const names = ((await listRes.json()).data as { name: string }[]).map(s => s.name);
    expect(names).toContain('The Open Market');
    expect(names).not.toContain('The Hidden Cellar');

    const byIdRes = await playerPage.request.get(`${BACKEND}/api/shops/${closedShopId}`, {
      headers: playerHeaders,
    });
    expect(byIdRes.status()).toBe(404);

    await playerCtx.close();
  });
});
