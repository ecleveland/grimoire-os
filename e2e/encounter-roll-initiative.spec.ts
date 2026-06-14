import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Roll all NPC initiatives (VEG-370)', () => {
  test('DM rolls NPC initiatives each-vs-shared, leaving the PC untouched', async ({ page }) => {
    await registerAndLogin(page, 'rollinit', 'E2E Roll-Init DM');
    // Fixture encounter ships with one PC, "Hero", at initiative 18.
    const { campaignId, encounterId } = await createEncounter(page, 'Roll Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // No NPCs yet → the roll controls are hidden.
    await expect(page.getByRole('button', { name: /roll initiative for each npc/i })).toHaveCount(
      0
    );

    // Add two of a monster from the lookup panel.
    await page.getByPlaceholder(/search monsters/i).fill('goblin');
    const result = page.getByTestId('lookup-result').first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();
    const dialog = page.getByRole('dialog');
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();
    const monsterName = ((await dialog.locator('h3').first().textContent()) ?? '').trim();
    await dialog.getByRole('button', { name: /add to encounter/i }).click();
    await dialog.getByLabel('Quantity').fill('2');
    await dialog.getByRole('button', { name: /add to encounter/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    const heroInit = page.getByLabel('Initiative for Hero', { exact: true });
    await expect(heroInit).toHaveValue('18');

    // Shared: one d20 applied to both NPCs → their initiatives match; PC untouched.
    await page.getByRole('button', { name: /roll one shared initiative for all npcs/i }).click();
    await expect(page.getByText(/rolled one initiative for all npcs/i)).toBeVisible();
    await expect(heroInit).toHaveValue('18');
    const a = await page.getByLabel(`Initiative for ${monsterName}`, { exact: true }).inputValue();
    const b = await page
      .getByLabel(`Initiative for ${monsterName} 2`, { exact: true })
      .inputValue();
    expect(a).toBe(b);

    // Each: independent rolls; we only assert it runs and leaves the PC alone.
    await page.getByRole('button', { name: /roll initiative for each npc/i }).click();
    await expect(page.getByText(/rolled npc initiatives/i)).toBeVisible();
    await expect(heroInit).toHaveValue('18');
  });
});
