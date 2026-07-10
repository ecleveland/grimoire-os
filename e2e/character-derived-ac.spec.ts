import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-410 — equipment-derived AC & weapons. Adding armor/weapons from the
// catalog snapshots gear metadata onto the inventory item; equipping them
// drives the sheet's AC block (with breakdown + manual override) and
// auto-populates the weapons table.

test.describe('character sheet — equipment-derived AC & weapons', () => {
  test('equipping catalog armor and weapons updates AC and the weapons table', async ({ page }) => {
    await registerAndLogin(page, 'derived-ac', 'Player One');
    const headers = await csrfHeaders(page);

    // No stored armorClass → the sheet shows the derived value.
    // Str 16 (+3), Dex 14 (+2), level 3 (prof +2).
    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Sable Quickstep',
        class: 'Fighter',
        level: 3,
        abilityScores: { strength: 16, dexterity: 14, constitution: 14 },
        hitPoints: { max: 28, current: 28, temporary: 0 },
        inventory: [],
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Sable Quickstep' })).toBeVisible();

    // Unarmored baseline: 10 + 2 Dex.
    await expect(page.getByTestId('ac-block')).toContainText('12');

    // Add + equip Chain Shirt (medium, 13 + Dex max 2) and Shield (+2) from
    // the catalog on the inventory tab.
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    for (const gear of ['Chain Shirt', 'Shield']) {
      await page.getByPlaceholder('Search the catalog to autofill…').fill(gear);
      await page.getByRole('button', { name: `Add ${gear}`, exact: true }).click();
      await expect(page.getByTestId('catalog-detail')).toContainText('Linked to catalog');
      await page.getByRole('button', { name: 'Add item', exact: true }).click();
      await page.getByRole('button', { name: `Equip ${gear}` }).click();
      await expect(page.getByRole('button', { name: `Unequip ${gear}` })).toBeVisible();
    }

    // Add + equip a Longsword the same way.
    await page.getByPlaceholder('Search the catalog to autofill…').fill('Longsword');
    await page.getByRole('button', { name: 'Add Longsword', exact: true }).click();
    await page.getByRole('button', { name: 'Add item', exact: true }).click();
    await page.getByRole('button', { name: 'Equip Longsword' }).click();
    await expect(page.getByRole('button', { name: 'Unequip Longsword' })).toBeVisible();

    // The AC block derives 13 + 2 Dex + 2 shield = 17 with its breakdown.
    await page.getByRole('tab', { name: 'Character' }).click();
    await expect(page.getByTestId('ac-block')).toContainText('17');
    await expect(page.getByTestId('ac-breakdown')).toContainText('13 + 2 Dex + 2 shield');

    // The weapons table gains a derived Longsword row: +3 Str +2 prof = +5.
    const weaponsRow = page.getByRole('row', { name: /Longsword/ });
    await expect(weaponsRow).toContainText('+5');
    await expect(weaponsRow).toContainText('1d8+3 Slashing');
    await expect(page.getByTestId('derived-weapon-tag')).toBeVisible();

    // Manual override wins…
    await page.getByLabel('AC override').fill('19');
    await page.getByRole('button', { name: 'Override' }).click();
    await expect(page.getByTestId('ac-block')).toContainText('19');
    await expect(page.getByTestId('ac-breakdown')).toContainText('manual override');

    // …and resetting falls back to the derived value.
    await page.getByRole('button', { name: 'Use derived AC' }).click();
    await expect(page.getByTestId('ac-block')).toContainText('17');
    await expect(page.getByTestId('ac-breakdown')).toContainText('13 + 2 Dex + 2 shield');

    // Reload to prove the gear snapshots persisted.
    await page.reload();
    await expect(page.getByTestId('ac-block')).toContainText('17');
    await expect(page.getByRole('row', { name: /Longsword/ })).toContainText('+5');
  });
});
