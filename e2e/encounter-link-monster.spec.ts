import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Link combatant to monster stat block (VEG-328)', () => {
  test('DM links a manual combatant, gains loot controls, then unlinks', async ({ page }) => {
    await registerAndLogin(page, 'link', 'E2E Link DM');
    const { campaignId, encounterId } = await createEncounter(page, 'Link Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // Hero is hand-entered and unlinked: link affordance, no loot roll.
    await expect(page.getByRole('button', { name: /roll loot for hero/i })).toHaveCount(0);
    await page.getByRole('button', { name: /link monster for hero/i }).click();

    // Pick a goblin from the compact search results.
    const dialog = page.getByRole('dialog', { name: /link monster/i });
    await dialog.getByLabel(/search monsters/i).fill('goblin');
    await dialog.getByTestId('link-result').first().click();
    await expect(page.getByText(/linked hero to goblin/i)).toBeVisible();
    await expect(dialog).not.toBeVisible();

    // The linkage is reference-only (name unchanged) and immediately unlocks
    // the monster-gated controls: click-to-view stat block and loot rolls.
    const heroButton = page.getByRole('button', { name: /^hero$/i });
    await expect(heroButton).toBeVisible();
    await page.getByRole('button', { name: /roll loot for hero/i }).click();
    await expect(page.getByText(/rolled loot for hero/i)).toBeVisible();

    // Unlink: the stat-block reference goes away but the rolled drop stays.
    await page.getByRole('button', { name: /unlink monster from hero/i }).click();
    await expect(page.getByText(/unlinked hero/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /^hero$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /link monster for hero/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /reroll loot for hero/i })).toHaveCount(0);
  });
});
