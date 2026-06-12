import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

// Golden path for homebrew monsters (VEG-293): create one via the form, see it
// flagged in the compendium list, then add it to an encounter from the tracker
// lookup exactly like an SRD monster.
test.describe('Custom monsters (VEG-293)', () => {
  test('DM creates a homebrew monster and adds it to an encounter', async ({ page }) => {
    await registerAndLogin(page, 'brew', 'E2E Homebrew DM');

    // Unique name so list search and tracker lookup find exactly this monster.
    const name = `Gloomfang ${Date.now()}`;

    // ── Create via the form ────────────────────────────────────────────────
    await page.goto('/srd/monsters');
    await page.getByRole('link', { name: /create monster/i }).click();
    await expect(page.getByRole('heading', { name: /create monster/i })).toBeVisible();

    await page.getByLabel(/^Name/).fill(name);
    await page.getByLabel(/^Size/).selectOption('Large');
    await page.getByLabel(/^Type/).selectOption('Monstrosity');
    await page.getByLabel(/Armor Class/).fill('14');
    await page.getByLabel(/Hit Points/).fill('59');
    await page.getByLabel(/^Speed/).fill('40 ft.');
    await page.getByLabel(/Challenge Rating/).fill('3');

    await page.getByRole('button', { name: 'Add action' }).click();
    await page.getByLabel(/Action name/).fill('Shadow Bite');
    await page.getByLabel(/Action description/).fill('Melee Weapon Attack: +6 to hit.');

    await page.getByRole('button', { name: 'Create monster' }).click();

    // ── Appears in the list, flagged as homebrew ───────────────────────────
    await expect(page).toHaveURL(/\/srd\/monsters$/);
    await page.getByPlaceholder('Search monsters...').fill(name);
    const card = page.getByTestId('monster-card').filter({ hasText: name }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Homebrew', { exact: true })).toBeVisible();

    // Detail modal shows the stat block with the homebrew badge and owner actions.
    await card.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();
    await expect(dialog.getByText('Shadow Bite.')).toBeVisible();
    await expect(dialog.getByRole('link', { name: /edit/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /delete/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // ── Prints like catalog content (VEG-331) ──────────────────────────────
    await page.getByRole('button', { name: `Add ${name} to print set` }).click();
    await page.goto('/srd/print');
    const printCard = page.getByTestId('print-card').filter({ hasText: name });
    await expect(printCard.first()).toBeVisible({ timeout: 10_000 });
    await expect(printCard.first().getByText('Shadow Bite')).toBeVisible();

    // ── Add it to an encounter from the tracker lookup ─────────────────────
    const { campaignId, encounterId } = await createEncounter(page, 'Brew Camp');
    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    await page.getByPlaceholder(/search monsters/i).fill(name);
    const result = page.getByTestId('lookup-result').first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    const lookupDialog = page.getByRole('dialog');
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();
    await expect(lookupDialog.getByText('Homebrew', { exact: true })).toBeVisible();

    await lookupDialog.getByRole('button', { name: /add to encounter/i }).click();
    await expect(lookupDialog.getByLabel('Quantity')).toBeVisible();
    await lookupDialog.getByRole('button', { name: /add to encounter/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // The combatant joins linked to its stat block: name renders as a button
    // (monsterId linkage), and clicking re-opens the homebrew stat block.
    const combatant = page.getByRole('button', { name, exact: true }).first();
    await expect(combatant).toBeVisible();
    await combatant.click();
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('Shadow Bite.')).toBeVisible();
  });
});
