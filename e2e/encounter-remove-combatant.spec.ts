import { expect, test } from '@playwright/test';
import { BACKEND, createEncounter, csrfHeaders, registerAndLogin } from './helpers';

test.describe('Remove combatant + clear all (VEG-284)', () => {
  test('DM removes a single combatant, then clears the whole board', async ({ page }) => {
    await registerAndLogin(page, 'rmc', 'E2E RemoveCombatant DM');
    const { campaignId, encounterId } = await createEncounter(page, 'RmC Camp');

    // Seed a second combatant so single-remove and clear-all are distinct steps.
    const headers = await csrfHeaders(page);
    const patchRes = await page.request.patch(`${BACKEND}/api/encounters/${encounterId}`, {
      data: {
        combatants: [
          { name: 'Hero', initiative: 18, hp: 24, maxHp: 24, ac: 16, isNpc: false },
          { name: 'Goblin', initiative: 12, hp: 7, maxHp: 7, ac: 13, isNpc: true },
        ],
      },
      headers,
    });
    expect(patchRes.ok(), `combatant seed failed: ${patchRes.status()}`).toBeTruthy();

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect(page.getByText('Goblin', { exact: true })).toBeVisible();

    // Remove the goblin — the confirm dialog gates the destructive write.
    await page.getByRole('button', { name: /remove goblin/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(/remove goblin/i);
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(page.getByText(/removed goblin/i)).toBeVisible();
    await expect(page.getByText('Goblin', { exact: true })).toHaveCount(0);

    // Durable, not client-side only: still gone after a reload.
    await page.reload();
    await expect(page.getByText('Hero', { exact: true })).toBeVisible();
    await expect(page.getByText('Goblin', { exact: true })).toHaveCount(0);

    // Clear the board — also confirmed.
    await page.getByRole('button', { name: /clear all/i }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /clear all/i })
      .click();
    await expect(page.getByText(/cleared all combatants/i)).toBeVisible();
    await expect(page.getByText('Hero', { exact: true })).toHaveCount(0);

    // The reset persists: empty tracker back at round 1.
    await page.reload();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect(page.getByText('Hero', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/round 1/i)).toBeVisible();
  });
});
