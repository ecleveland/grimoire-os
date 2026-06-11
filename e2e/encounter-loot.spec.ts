import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

const COINAGE = /\d+ gp · \d+ sp · \d+ cp/;

test.describe('Encounter loot rolls (VEG-301)', () => {
  test('DM adds a monster, rolls encounter loot, and sees the per-monster drop plus total', async ({
    page,
  }) => {
    await registerAndLogin(page, 'loot', 'E2E Loot DM');
    const { campaignId, encounterId } = await createEncounter(page, 'Loot Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // Before any roll: empty loot section, and the encounter roll is disabled
    // because no combatant links to a monster (Hero is a manual PC).
    await expect(page.getByText(/no loot rolled yet/i)).toBeVisible();
    const rollAll = page.getByRole('button', { name: /roll loot for encounter/i });
    await expect(rollAll).toBeDisabled();

    // Add a goblin from the lookup panel.
    await page.getByPlaceholder(/search monsters/i).fill('goblin');
    await page.getByTestId('lookup-result').first().click();
    await page.getByRole('button', { name: /add to encounter/i }).click(); // stat-block CTA
    await page.getByRole('button', { name: /add to encounter/i }).click(); // dialog confirm
    await expect(page.getByText(/added .* to the encounter/i)).toBeVisible();

    // Roll loot for the whole encounter.
    await expect(rollAll).toBeEnabled();
    await rollAll.click();
    await expect(page.getByText(/rolled loot for the encounter/i)).toBeVisible();

    // The per-monster drop renders inline and feeds the encounter total —
    // with a single monster both coinage lines show the same roll.
    await expect(page.getByText(COINAGE)).toHaveCount(2);

    // The drop is durable, not a one-shot dialog: still there after reload.
    await page.reload();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect(page.getByText(COINAGE)).toHaveCount(2);

    // Per-combatant reroll replaces the drop in place.
    await page.getByRole('button', { name: /reroll loot for/i }).click();
    await expect(page.getByText(/re-rolled loot for/i)).toBeVisible();
    await expect(page.getByText(COINAGE)).toHaveCount(2);
  });
});
