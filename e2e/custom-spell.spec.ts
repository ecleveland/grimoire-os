import { expect, test } from '@playwright/test';
import { registerAndLogin } from './helpers';

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
});
