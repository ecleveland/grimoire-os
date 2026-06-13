import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Encounter conditions / concentration / exhaustion (VEG-287)', () => {
  test('tagging a condition, concentrating, and setting exhaustion all persist', async ({
    page,
  }) => {
    await registerAndLogin(page, 'cond', 'E2E Conditions DM');
    const { campaignId, encounterId } = await createEncounter(page, 'Conditions Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // Add a condition via the per-combatant select — a chip appears.
    await page.getByLabel('Add condition to Hero').selectOption('Poisoned');
    await expect(page.locator('span', { hasText: 'Poisoned' })).toBeVisible();

    // Start concentrating and name the spell.
    await page.getByRole('button', { name: 'Toggle concentration for Hero' }).click();
    const spell = page.getByLabel('Concentration spell for Hero');
    await spell.fill('Bless');
    await spell.press('Enter');
    await expect(page.getByText('Concentrating: Bless')).toBeVisible();

    // Set an exhaustion level.
    await page.getByLabel('Exhaustion for Hero').selectOption('Exhaustion 3');
    await expect(page.locator('span', { hasText: 'Exhaustion 3' })).toBeVisible();

    // All three survive a reload — they reached the server.
    await page.reload();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect(page.locator('span', { hasText: 'Poisoned' })).toBeVisible();
    await expect(page.getByText('Concentrating: Bless')).toBeVisible();
    await expect(page.locator('span', { hasText: 'Exhaustion 3' })).toBeVisible();

    // Removing the condition via the chip × clears it.
    await page.getByRole('button', { name: 'Remove Poisoned from Hero' }).click();
    await expect(page.locator('span', { hasText: 'Poisoned' })).toHaveCount(0);
  });
});
