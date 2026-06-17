import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-402 (Workstream C, slice 1) — inventory CRUD on the character sheet.
// The owner can add (free-typed or catalog-linked), equip, edit, and remove
// inventory items without leaving the sheet, each change optimistic-lock-safe,
// with a carrying-capacity readout.

test.describe('character sheet — inventory CRUD', () => {
  test('owner adds, equips, edits, removes, and catalog-links inventory items', async ({
    page,
  }) => {
    await registerAndLogin(page, 'inventory-crud', 'Player One');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Bramble Hauler',
        class: 'Fighter',
        level: 3,
        abilityScores: { strength: 16, dexterity: 12, constitution: 14 },
        hitPoints: { max: 28, current: 28, temporary: 0 },
        inventory: [],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Bramble Hauler' })).toBeVisible();

    // Inventory lives on the Spells & Details tab.
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(page.getByText('Equipment')).toBeVisible();

    // Add a free-typed item.
    await page.getByLabel('New item name').fill('Torch');
    await page.getByLabel('New item quantity').fill('3');
    await page.getByLabel('New item weight').fill('1');
    await page.getByRole('button', { name: 'Add item' }).click();
    await expect(page.getByRole('cell', { name: 'Torch', exact: true })).toBeVisible();

    // Carrying-capacity readout: STR 16 → 240 lb; 3 torches × 1 lb = 3 carried.
    await expect(page.getByTestId('carrying-capacity')).toContainText('Carried 3 / 240 lb');

    // Equip the torch.
    await page.getByRole('button', { name: 'Equip Torch' }).click();
    await expect(page.getByRole('button', { name: 'Unequip Torch' })).toBeVisible();

    // Edit the torch's quantity.
    await page.getByRole('button', { name: 'Edit Torch' }).click();
    await page.getByLabel('Item quantity', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByTestId('carrying-capacity')).toContainText('Carried 5 / 240 lb');

    // Add a catalog-linked item via the picker (Dagger is seeded in the SRD).
    await page.getByPlaceholder('Search the catalog to autofill…').fill('Dagger');
    await page.getByRole('button', { name: 'Add Dagger', exact: true }).click();
    await expect(page.getByTestId('catalog-detail')).toContainText('Linked to catalog');
    await expect(page.getByLabel('New item name')).toHaveValue('Dagger');
    await page.getByRole('button', { name: 'Add item' }).click();
    await expect(page.getByRole('cell', { name: 'Dagger', exact: true })).toBeVisible();

    // Remove the torch.
    await page.getByRole('button', { name: 'Remove Torch' }).click();
    await expect(page.getByRole('cell', { name: 'Torch', exact: true })).toBeHidden();

    // Reload to prove the writes persisted (Dagger survives, Torch is gone).
    await page.reload();
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(page.getByRole('cell', { name: 'Dagger', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Torch', exact: true })).toBeHidden();
  });
});
