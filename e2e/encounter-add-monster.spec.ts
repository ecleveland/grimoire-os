import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Add monster to encounter + click-combatant-to-view (VEG-260)', () => {
  test('DM adds a monster from the lookup panel, then re-opens its stat block from the tracker', async ({
    page,
  }) => {
    await registerAndLogin(page, 'add', 'E2E Add-Monster DM');
    const { campaignId, encounterId } = await createEncounter(page, 'Add Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // Search the compendium and open the goblin stat block.
    await page.getByPlaceholder(/search monsters/i).fill('goblin');
    const result = page.getByTestId('lookup-result').first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();

    // Capture the monster's name from the stat block — the first 'goblin' match
    // is whatever the seeded compendium ranks first, so don't hard-code it.
    const monsterName = ((await dialog.locator('h3').first().textContent()) ?? '').trim();
    expect(monsterName.length).toBeGreaterThan(0);

    // Add-to-encounter CTA → quantity/initiative dialog → confirm.
    await dialog.getByRole('button', { name: /add to encounter/i }).click();
    await expect(dialog.getByLabel('Quantity')).toBeVisible();
    await dialog.getByRole('button', { name: /add to encounter/i }).click();

    // Overlay closes and a linked NPC combatant (named after the monster) joins
    // the tracker — the name is a button precisely because it carries a monsterId.
    await expect(page.getByRole('dialog')).toBeHidden();
    const combatant = page.getByRole('button', { name: monsterName, exact: true }).first();
    await expect(combatant).toBeVisible();

    // Clicking the linked combatant surfaces its source stat block (VEG-260).
    // On a desktop viewport that lands in the always-on side panel (VEG-384),
    // not a modal; narrow screens still use the dialog viewer.
    await combatant.click();
    const statPanel = page.getByTestId('active-stat-panel');
    await expect(statPanel.getByTestId('monster-stat-block')).toBeVisible();
    await expect(statPanel.getByRole('heading', { name: monsterName })).toBeVisible();
  });
});
