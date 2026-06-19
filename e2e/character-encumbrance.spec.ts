import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-406 — encumbrance status tiers + speed impact on the sheet. Carried weight
// crossing Strength×5 / Strength×10 surfaces the encumbered / heavily-encumbered
// tier and its movement penalty in the Equipment section.

test.describe('character sheet — encumbrance tiers', () => {
  test('surfaces the encumbered and heavily-encumbered tiers with speed impact', async ({
    page,
  }) => {
    await registerAndLogin(page, 'encumbrance', 'Player One');
    const headers = await csrfHeaders(page);

    // STR 10, speed 30 → encumbered above 50 lb, heavily encumbered above 100 lb.
    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Hefty Halfling',
        class: 'Fighter',
        level: 3,
        abilityScores: { strength: 10, dexterity: 12, constitution: 14 },
        hitPoints: { max: 28, current: 28, temporary: 0 },
        speed: 30,
        inventory: [],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Hefty Halfling' })).toBeVisible();
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(page.getByText('Equipment')).toBeVisible();

    // No encumbrance indicator with an empty pack.
    await expect(page.getByTestId('encumbrance-status')).toBeHidden();

    // Add a 60 lb load → carried 60 > 50 → encumbered, speed 30 → 20 ft.
    await page.getByLabel('New item name').fill('Anvil');
    await page.getByLabel('New item quantity').fill('1');
    await page.getByLabel('New item weight').fill('60');
    await page.getByRole('button', { name: 'Add item' }).click();

    const status = page.getByTestId('encumbrance-status');
    await expect(status).toContainText('Encumbered');
    await expect(status).toContainText('30 → 20 ft');
    await expect(status).not.toContainText('disadvantage');

    // Bump to two anvils → carried 120 > 100 → heavily encumbered, speed 30 → 10 ft.
    await page.getByRole('button', { name: 'Edit Anvil' }).click();
    await page.getByLabel('Item quantity', { exact: true }).fill('2');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(status).toContainText('Heavily encumbered');
    await expect(status).toContainText('30 → 10 ft');
    await expect(status).toContainText('disadvantage');
  });
});
