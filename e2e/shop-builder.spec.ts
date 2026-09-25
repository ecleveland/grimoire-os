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

  // VEG-355 — themed presets: picking a theme and clicking "Suggest stock"
  // pre-fills the editor with catalog-derived lines the DM then saves.
  test('DM creates a shop from suggested theme stock', async ({ page }) => {
    await registerAndLogin(page, 'shop-theme-dm');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Theme Camp ${Date.now()}` },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    await page.goto(`/campaigns/${campaignId}/shops/new`);
    await expect(page.getByRole('heading', { name: /new shop/i })).toBeVisible();

    await page.getByLabel(/^name/i).fill("Maelin's Apothecary");
    await page.getByLabel(/^theme/i).selectOption('alchemist');

    // Suggest stock from the alchemist theme; the editor fills with catalog
    // lines (e.g. Acid, a curated pool item priced from its catalog cost).
    await page.getByRole('button', { name: /suggest stock for alchemist/i }).click();
    await expect(page.getByText('Acid', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /create shop/i }).click();

    // The suggested item lands on the themed storefront with its default price.
    await expect(page.getByRole('heading', { name: "Maelin's Apothecary" })).toBeVisible();
    await expect(page.getByText('Acid', { exact: true })).toBeVisible();
    await expect(page.getByText('25 gp')).toBeVisible();
  });

  // VEG-556 — shop lines may reference the SRD and shared catalog only. The
  // picker asks for that tier, and the server refuses a homebrew itemId even
  // when the DM owns it, so a line can never point at a row a buyer cannot read.
  test('DM cannot stock their own homebrew item', async ({ page }) => {
    await registerAndLogin(page, 'shop-homebrew-dm');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Homebrew Camp ${Date.now()}` },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    const itemName = `Smuggled Draught ${Date.now()}`;
    const itemRes = await page.request.post(`${BACKEND}/api/srd/items`, {
      data: {
        name: itemName,
        category: 'Potion',
        cost: '1 gp',
        description: 'A draught that never made it onto a shelf.',
      },
      headers,
    });
    expect(itemRes.ok(), `item create failed: ${itemRes.status()}`).toBeTruthy();
    const itemId = (await itemRes.json()).id as string;

    // The picker searches the global tier, so the DM's own homebrew is absent
    // from their results (the search debounces 300ms before the request).
    await page.goto(`/campaigns/${campaignId}/shops/new`);
    await expect(page.getByRole('heading', { name: /new shop/i })).toBeVisible();

    await page.getByLabel(/search items/i).fill(itemName);
    await expect(page.getByText(/no matching items/i)).toBeVisible();

    // And the server refuses the id outright, so a hand-rolled request cannot
    // route around the picker.
    const shopRes = await page.request.post(`${BACKEND}/api/shops`, {
      data: {
        campaignId,
        name: 'The Back Room',
        theme: 'alchemist',
        items: [{ itemId, name: 'Smuggled Draught', category: 'Potion', price: { gp: 1 } }],
      },
      headers,
    });
    expect(shopRes.status()).toBe(400);
    // The rejection lists each unresolved id, then states the rule once.
    const body = (await shopRes.json()) as { message: string[] };
    expect(body.message.join(' ')).toContain('homebrew items are not eligible');
  });
});
