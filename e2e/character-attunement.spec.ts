import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-403 (Workstream C, slice 2) — magic item attunement management.
// The owner can attune up to 3 items (free-typed or catalog-linked) and remove
// them, each change optimistic-lock-safe, with the 3-slot cap enforced in the UI.

test.describe('character sheet — attunement management', () => {
  test('owner attunes, hits the 3-slot cap, removes, and catalog-links', async ({ page }) => {
    await registerAndLogin(page, 'attunement', 'Player One');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Sable Wardkeeper',
        class: 'Wizard',
        level: 5,
        abilityScores: { strength: 10, dexterity: 14, constitution: 12 },
        hitPoints: { max: 22, current: 22, temporary: 0 },
        attunedItems: [],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Sable Wardkeeper' })).toBeVisible();

    // Attunement lives in the inventory panel on the Spells & Details tab.
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(page.getByText('Attunement')).toBeVisible();

    // Attune a free-typed item.
    await page.getByLabel('New attunement name').fill('Cloak of Protection');
    await page.getByRole('button', { name: 'Attune item' }).click();
    await expect(page.getByText('Cloak of Protection')).toBeVisible();

    // Attune a catalog-linked item (Dagger is seeded in the SRD).
    await page.getByPlaceholder('Search the catalog to attune…').fill('Dagger');
    await page.getByRole('button', { name: 'Add Dagger', exact: true }).click();
    await expect(page.getByLabel('New attunement name')).toHaveValue('Dagger');
    await page.getByRole('button', { name: 'Attune item' }).click();
    await expect(page.getByText('Dagger')).toBeVisible();

    // Attune a third → slots full, add form gone.
    await page.getByLabel('New attunement name').fill('Ring of Evasion');
    await page.getByRole('button', { name: 'Attune item' }).click();
    await expect(page.getByText(/slots full/i)).toBeVisible();
    await expect(page.getByTestId('add-attunement-form')).toBeHidden();

    // Remove one → the add form returns.
    await page.getByRole('button', { name: 'Remove attunement Cloak of Protection' }).click();
    await expect(page.getByTestId('add-attunement-form')).toBeVisible();

    // Reload to prove the writes persisted (Dagger + Ring survive, Cloak gone).
    await page.reload();
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(page.getByText('Dagger')).toBeVisible();
    await expect(page.getByText('Ring of Evasion')).toBeVisible();
    await expect(page.getByText('Cloak of Protection')).toBeHidden();
  });
});
