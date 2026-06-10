import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Encounter monster-lookup panel (VEG-259)', () => {
  test('searches a monster and opens its stat block without disrupting the encounter', async ({
    page,
  }) => {
    await registerAndLogin(page, 'enc', 'E2E Encounter DM');
    const { campaignId, encounterId } = await createEncounter(page, 'Lookup Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // The lookup panel is present and unobtrusive — no results until you search.
    await expect(page.getByText(/monster lookup/i)).toBeVisible();
    const search = page.getByPlaceholder(/search monsters/i);
    await expect(search).toBeVisible();
    await expect(page.getByText(/type to search/i)).toBeVisible();

    // Debounced search hits /srd/monsters and renders compact results.
    await search.fill('goblin');
    const result = page.getByTestId('lookup-result').first();
    await expect(result).toBeVisible({ timeout: 10_000 });

    // Selecting a result opens the shared stat block in the overlay.
    await result.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();
    await expect(dialog.getByText('NaN')).toHaveCount(0);

    // Closing the overlay leaves the encounter intact.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
  });
});
