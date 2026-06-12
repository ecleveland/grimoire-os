import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Add manual combatant (VEG-282)', () => {
  test('DM adds an ad-hoc combatant by hand and it joins the initiative order', async ({
    page,
  }) => {
    await registerAndLogin(page, 'addc', 'E2E AddCombatant DM');
    const { campaignId, encounterId } = await createEncounter(page, 'AddC Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // Open the manual form and fill it in.
    await page.getByRole('button', { name: /add combatant/i }).click();
    const dialog = page.getByRole('dialog', { name: /add combatant/i });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/^name$/i).fill('Animated Armor');
    await dialog.getByLabel(/^initiative$/i).fill('12');
    await dialog.getByLabel(/^hp$/i).fill('33');
    await dialog.getByLabel(/^max hp$/i).fill('33');
    await dialog.getByLabel(/^ac$/i).fill('18');
    await dialog.getByRole('button', { name: /add combatant/i }).click();

    await expect(page.getByText(/added animated armor to the encounter/i)).toBeVisible();
    await expect(dialog).not.toBeVisible();

    // The combatant renders in the tracker, sorted below the Hero (init 18 > 12),
    // as plain text — no monsterId means no click-to-view stat-block button.
    // Exact match: the success toast also contains the name.
    await expect(page.getByText('Animated Armor', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^animated armor$/i })).toHaveCount(0);

    // Durable, not client-side only: still present after a reload.
    await page.reload();
    await expect(page.getByText('Animated Armor', { exact: true })).toBeVisible();

    // Adding the same name again auto-numbers instead of colliding.
    await page.getByRole('button', { name: /add combatant/i }).click();
    await dialog.getByLabel(/^name$/i).fill('Animated Armor');
    await dialog.getByRole('button', { name: /add combatant/i }).click();
    await expect(page.getByText('Animated Armor 2', { exact: true })).toBeVisible();
  });
});
