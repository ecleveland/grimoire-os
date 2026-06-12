import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// Golden path for homebrew feats (VEG-295): create one via the form, see it
// flagged in the compendium list, open the detail, edit it, then delete it.
test.describe('Custom feats (VEG-295)', () => {
  test('user creates, edits, and deletes a homebrew feat', async ({ page }) => {
    await registerAndLogin(page, 'feat', 'E2E Homebrew Brewer');

    // Unique name so list search finds exactly this feat.
    const name = `Lucky Dodge ${Date.now()}`;

    // ── Create via the form ────────────────────────────────────────────────
    await page.goto('/srd/feats');
    await page.getByRole('link', { name: /create feat/i }).click();
    await expect(page.getByRole('heading', { name: /create feat/i })).toBeVisible();

    await page.getByLabel(/^Name/).fill(name);
    await page.getByLabel(/^Category/).selectOption('General');
    await page.getByLabel(/^Prerequisite/).fill('Dexterity 13+');
    await page.getByLabel(/^Description/).fill('You twist away from danger at the last moment.');
    await page
      .getByLabel(/^Benefits/)
      .fill('Slippery: Once per rest, impose disadvantage on an attack against you.');
    await page.getByLabel(/Repeatable/).check();

    await page.getByRole('button', { name: 'Create feat' }).click();

    // ── Appears in the list, flagged as homebrew ───────────────────────────
    await expect(page).toHaveURL(/\/srd\/feats$/);
    await page.getByPlaceholder('Search feats...').fill(name);
    const card = page.getByTestId('feat-card').filter({ hasText: name }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Homebrew', { exact: true })).toBeVisible();

    // ── Detail modal shows the feat with owner actions ─────────────────────
    await card.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('You twist away from danger at the last moment.')).toBeVisible();
    await expect(
      dialog.getByText('Slippery: Once per rest, impose disadvantage on an attack against you.')
    ).toBeVisible();
    await expect(dialog.getByText('Repeatable', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: /edit/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /delete/i })).toBeVisible();

    // ── Edit it ────────────────────────────────────────────────────────────
    await dialog.getByRole('link', { name: /edit/i }).click();
    await expect(page.getByRole('heading', { name: /edit feat/i })).toBeVisible();
    await expect(page.getByLabel(/^Name/)).toHaveValue(name);

    const editedName = `${name} (Greater)`;
    await page.getByLabel(/^Name/).fill(editedName);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/srd\/feats$/);
    await page.getByPlaceholder('Search feats...').fill(editedName);
    const editedCard = page.getByTestId('feat-card').filter({ hasText: editedName }).first();
    await expect(editedCard).toBeVisible({ timeout: 10_000 });

    // ── Delete it ──────────────────────────────────────────────────────────
    await editedCard.click();
    const editedDialog = page.getByRole('dialog');
    await expect(editedDialog).toBeVisible();
    await editedDialog.getByRole('button', { name: /delete/i }).click();
    await page.getByRole('button', { name: /^Delete feat$/i }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByPlaceholder('Search feats...').fill(editedName);
    await expect(page.getByTestId('feat-card').filter({ hasText: editedName })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test("another user's homebrew feat is invisible and immutable to them", async ({ page }) => {
    // User A creates a homebrew feat via the API.
    await registerAndLogin(page, 'feat-a', 'E2E Feat Owner');
    const name = `Umbral Reflexes ${Date.now()}`;
    const create = await page.request.post(`${BACKEND}/api/srd/feats`, {
      data: {
        name,
        description: 'Shadows sharpen your reactions beyond mortal limits.',
        prerequisite: 'Dexterity 13+',
        category: 'General',
      },
      headers: await csrfHeaders(page),
    });
    expect(create.ok(), `feat create failed: ${create.status()}`).toBeTruthy();
    const featId = (await create.json()).id as string;

    // User B logs in (replaces the session cookies).
    await registerAndLogin(page, 'feat-b', 'E2E Feat Stranger');

    // (a) A's homebrew never appears in B's browse list.
    await page.goto('/srd/feats');
    await page.getByPlaceholder('Search feats...').fill(name);
    await expect(page.getByText(/0 feats found/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('feat-card').filter({ hasText: name })).toHaveCount(0);

    // (b) The detail endpoint resolves empty for B — no existence leak.
    const detail = await page.request.get(`${BACKEND}/api/srd/feats/${featId}`);
    expect(detail.status()).toBe(200);
    expect(await detail.text()).not.toContain(name);

    // (c) B cannot mutate it: writes 404 (not 403 — existence must not leak).
    const headers = await csrfHeaders(page);
    const patch = await page.request.patch(`${BACKEND}/api/srd/feats/${featId}`, {
      data: { name: 'Stolen Reflexes' },
      headers,
    });
    expect(patch.status()).toBe(404);
    const del = await page.request.delete(`${BACKEND}/api/srd/feats/${featId}`, { headers });
    expect(del.status()).toBe(404);
  });
});
