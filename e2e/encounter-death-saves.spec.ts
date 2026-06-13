import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Encounter death saves for downed PCs (VEG-288)', () => {
  test('a downed PC gets a death-save tracker that persists, and healing clears it', async ({
    page,
  }) => {
    await registerAndLogin(page, 'death', 'E2E Death-Saves DM');
    // The seeded encounter has one PC combatant, "Hero" (isNpc=false).
    const { campaignId, encounterId } = await createEncounter(page, 'Death Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // No tracker while the PC is up.
    await expect(page.getByText('Death Saves')).toHaveCount(0);

    // Drop Hero to 0 HP via the direct HP input → the tracker appears.
    const hp = page.getByRole('spinbutton');
    await hp.click();
    await hp.fill('0');
    await hp.press('Enter');
    await expect(page.getByText('Death Saves')).toBeVisible();

    // Mark a death-save success; it persists across a reload.
    await page.getByRole('button', { name: 'Mark death save success for Hero' }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect(page.getByText('Death Saves')).toBeVisible();

    // Healing above 0 revives the PC and clears the tracker.
    await page.getByLabel('Damage or heal amount for Hero').fill('10');
    await page.getByRole('button', { name: 'Heal Hero' }).click();
    await expect(page.getByText('Death Saves')).toHaveCount(0);

    // And the revival survives a reload — the saves were cleared server-side.
    await page.reload();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect(page.getByText('Death Saves')).toHaveCount(0);
  });
});
