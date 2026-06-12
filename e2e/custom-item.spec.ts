import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// Golden path for homebrew items (VEG-296): create one via the form, see it
// flagged in the compendium list, edit it, then delete it.
test.describe('Custom items (VEG-296)', () => {
  test('user creates, edits, and deletes a homebrew item', async ({ page }) => {
    await registerAndLogin(page, 'item', 'E2E Item Brewer');

    // Unique name so list search finds exactly this item.
    const name = `Cloak of Whispers ${Date.now()}`;

    // ── Create via the form ────────────────────────────────────────────────
    await page.goto('/srd/items');
    await page.getByRole('link', { name: /create item/i }).click();
    await expect(page.getByRole('heading', { name: /create item/i })).toBeVisible();

    await page.getByLabel(/^Name/).fill(name);
    await page.getByLabel(/^Category/).selectOption('Wondrous Item');
    await page.getByLabel(/^Rarity/).selectOption('Rare');
    await page.getByLabel(/Magic item/).check();
    await page.getByLabel(/Requires attunement/).check();
    await page.getByLabel(/^Cost/).fill('500 gp');
    await page.getByLabel(/^Properties/).fill('Mysterious, Silent');
    await page
      .getByLabel(/^Description/)
      .fill('A cloak woven from twilight that muffles every footstep.');

    await page.getByRole('button', { name: 'Create item' }).click();

    // ── Appears in the list, flagged as homebrew ───────────────────────────
    await expect(page).toHaveURL(/\/srd\/items$/);
    await page.getByPlaceholder('Search items...').fill(name);
    const card = page.getByTestId('item-card').filter({ hasText: name }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Homebrew', { exact: true })).toBeVisible();
    await expect(card.getByText('Rare', { exact: true })).toBeVisible();
    await expect(card.getByText('Requires Attunement')).toBeVisible();

    // ── Expanded details show the description; owner actions are present ───
    await card.getByRole('button', { name: 'Show details' }).click();
    await expect(
      card.getByText('A cloak woven from twilight that muffles every footstep.')
    ).toBeVisible();
    await expect(card.getByRole('link', { name: /edit/i })).toBeVisible();
    await expect(card.getByRole('button', { name: /delete/i })).toBeVisible();

    // ── Edit it ────────────────────────────────────────────────────────────
    await card.getByRole('link', { name: /edit/i }).click();
    await expect(page.getByRole('heading', { name: /edit item/i })).toBeVisible();
    await expect(page.getByLabel(/^Name/)).toHaveValue(name);

    const editedName = `${name} (Greater)`;
    await page.getByLabel(/^Name/).fill(editedName);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/srd\/items$/);
    await page.getByPlaceholder('Search items...').fill(editedName);
    const editedCard = page.getByTestId('item-card').filter({ hasText: editedName }).first();
    await expect(editedCard).toBeVisible({ timeout: 10_000 });

    // ── Delete it ──────────────────────────────────────────────────────────
    await editedCard.getByRole('button', { name: /delete/i }).click();
    await page.getByRole('button', { name: /^Delete item$/i }).click();

    await page.getByPlaceholder('Search items...').fill(editedName);
    await expect(page.getByTestId('item-card').filter({ hasText: editedName })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test("another user's homebrew item is invisible and immutable to them", async ({ page }) => {
    // User A creates a homebrew item via the API.
    await registerAndLogin(page, 'item-a', 'E2E Item Owner');
    const name = `Umbral Buckler ${Date.now()}`;
    const create = await page.request.post(`${BACKEND}/api/srd/items`, {
      data: {
        name,
        category: 'Shield',
        description: 'A shield of woven shadow.',
        rarity: 'Uncommon',
        isMagic: true,
      },
      headers: await csrfHeaders(page),
    });
    expect(create.ok(), `item create failed: ${create.status()}`).toBeTruthy();
    const itemId = (await create.json()).id as string;

    // User B logs in (replaces the session cookies).
    await registerAndLogin(page, 'item-b', 'E2E Item Stranger');

    // (a) A's homebrew never appears in B's browse list.
    await page.goto('/srd/items');
    await page.getByPlaceholder('Search items...').fill(name);
    await expect(page.getByText(/0 items found/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('item-card').filter({ hasText: name })).toHaveCount(0);

    // (b) The detail endpoint resolves empty for B — no existence leak.
    const detail = await page.request.get(`${BACKEND}/api/srd/items/${itemId}`);
    expect(detail.status()).toBe(200);
    expect(await detail.text()).not.toContain(name);

    // (c) B cannot mutate it: writes 404 (not 403 — existence must not leak).
    const headers = await csrfHeaders(page);
    const patch = await page.request.patch(`${BACKEND}/api/srd/items/${itemId}`, {
      data: { name: 'Stolen Buckler' },
      headers,
    });
    expect(patch.status()).toBe(404);
    const del = await page.request.delete(`${BACKEND}/api/srd/items/${itemId}`, { headers });
    expect(del.status()).toBe(404);
  });
});
