import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// Golden path for homebrew spells (VEG-294): create one via the form, see it
// flagged in the compendium list, open the detail, edit it, then delete it.
test.describe('Custom spells (VEG-294)', () => {
  test('user creates, edits, and deletes a homebrew spell', async ({ page }) => {
    await registerAndLogin(page, 'spell', 'E2E Homebrew Caster');

    // Unique name so list search finds exactly this spell.
    const name = `Soul Bonfire ${Date.now()}`;

    // ── Create via the form ────────────────────────────────────────────────
    await page.goto('/srd/spells');
    await page.getByRole('link', { name: /create spell/i }).click();
    await expect(page.getByRole('heading', { name: /create spell/i })).toBeVisible();

    await page.getByLabel(/^Name/).fill(name);
    await page.getByLabel(/^Level/).selectOption('3');
    await page.getByLabel(/^School/).selectOption('Evocation');
    await page.getByLabel(/Casting Time/).fill('1 action');
    await page.getByLabel(/^Range/).fill('150 feet');
    await page.getByLabel(/^Components/).fill('V, S, M');
    await page.getByLabel(/^Duration/).fill('Instantaneous');
    await page.getByLabel(/^Classes/).fill('Sorcerer, Wizard');
    await page.getByLabel(/^Description/).fill('A roaring column of soulfire erupts.');
    await page.getByLabel(/Concentration/).check();

    await page.getByRole('button', { name: 'Create spell' }).click();

    // ── Appears in the list, flagged as homebrew ───────────────────────────
    await expect(page).toHaveURL(/\/srd\/spells$/);
    await page.getByPlaceholder('Search spells...').fill(name);
    const card = page.getByTestId('spell-card').filter({ hasText: name }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Homebrew', { exact: true })).toBeVisible();

    // ── Detail modal shows the spell with owner actions ────────────────────
    await card.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('A roaring column of soulfire erupts.')).toBeVisible();
    await expect(dialog.getByText('150 feet')).toBeVisible();
    await expect(dialog.getByText('Concentration', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('link', { name: /edit/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /delete/i })).toBeVisible();

    // ── Edit it ────────────────────────────────────────────────────────────
    await dialog.getByRole('link', { name: /edit/i }).click();
    await expect(page.getByRole('heading', { name: /edit spell/i })).toBeVisible();
    await expect(page.getByLabel(/^Name/)).toHaveValue(name);

    const editedName = `${name} (Greater)`;
    await page.getByLabel(/^Name/).fill(editedName);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/srd\/spells$/);
    await page.getByPlaceholder('Search spells...').fill(editedName);
    const editedCard = page.getByTestId('spell-card').filter({ hasText: editedName }).first();
    await expect(editedCard).toBeVisible({ timeout: 10_000 });

    // ── Delete it ──────────────────────────────────────────────────────────
    await editedCard.click();
    const editedDialog = page.getByRole('dialog');
    await expect(editedDialog).toBeVisible();
    await editedDialog.getByRole('button', { name: /delete/i }).click();
    await page.getByRole('button', { name: /^Delete spell$/i }).click();

    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByPlaceholder('Search spells...').fill(editedName);
    await expect(page.getByTestId('spell-card').filter({ hasText: editedName })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test("another user's homebrew spell is invisible and immutable to them", async ({ page }) => {
    // User A creates a homebrew spell via the API.
    await registerAndLogin(page, 'spell-a', 'E2E Spell Owner');
    const name = `Umbral Lance ${Date.now()}`;
    const create = await page.request.post(`${BACKEND}/api/srd/spells`, {
      data: {
        name,
        level: 1,
        school: 'Evocation',
        castingTime: '1 action',
        range: '90 feet',
        components: 'V, S',
        duration: 'Instantaneous',
        description: 'A lance of pure shadow streaks toward a creature you can see.',
        classes: ['Wizard'],
      },
      headers: await csrfHeaders(page),
    });
    expect(create.ok(), `spell create failed: ${create.status()}`).toBeTruthy();
    const spellId = (await create.json()).id as string;

    // User B logs in (replaces the session cookies).
    await registerAndLogin(page, 'spell-b', 'E2E Spell Stranger');

    // (a) A's homebrew never appears in B's browse list.
    await page.goto('/srd/spells');
    await page.getByPlaceholder('Search spells...').fill(name);
    await expect(page.getByText(/0 spells found/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('spell-card').filter({ hasText: name })).toHaveCount(0);

    // (b) The detail endpoint resolves empty for B — no existence leak.
    const detail = await page.request.get(`${BACKEND}/api/srd/spells/${spellId}`);
    expect(detail.status()).toBe(200);
    expect(await detail.text()).not.toContain(name);

    // (c) B cannot mutate it: writes 404 (not 403 — existence must not leak).
    const headers = await csrfHeaders(page);
    const patch = await page.request.patch(`${BACKEND}/api/srd/spells/${spellId}`, {
      data: { name: 'Stolen Lance' },
      headers,
    });
    expect(patch.status()).toBe(404);
    const del = await page.request.delete(`${BACKEND}/api/srd/spells/${spellId}`, { headers });
    expect(del.status()).toBe(404);
  });
});
