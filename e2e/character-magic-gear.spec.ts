import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-460 — magic-item gear metadata. A seeded magic shield (enriched to "+2")
// derives AC like a mundane shield when equipped from the catalog; a magic
// weapon with no structured stats surfaces a "no derivable stats" hint in the
// picker so the equip-does-nothing behavior is discoverable.
test.describe('character sheet — magic-item gear (VEG-460)', () => {
  test('a magic shield derives AC; a magic weapon shows the no-derivable-stats hint', async ({
    page,
  }) => {
    await registerAndLogin(page, 'magic-gear', 'Player One');
    const headers = await csrfHeaders(page);

    // Dex 14 (+2) → unarmored AC 12; no stored armorClass so the sheet derives.
    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Rune Warden',
        class: 'Fighter',
        level: 3,
        abilityScores: { strength: 14, dexterity: 14, constitution: 14 },
        hitPoints: { max: 28, current: 28, temporary: 0 },
        inventory: [],
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Rune Warden' })).toBeVisible();
    await expect(page.getByTestId('ac-block')).toContainText('12');

    await page.getByRole('tab', { name: 'Spells & Details' }).click();

    // Pick a magic weapon: no derivable stats → the picker warns, and equipping
    // it would contribute nothing.
    await page.getByPlaceholder('Search the catalog to autofill…').fill('Flame Tongue');
    await page.getByRole('button', { name: 'Add Flame Tongue', exact: true }).click();
    await expect(page.getByTestId('catalog-gear-hint')).toContainText(/no derivable stats/i);

    // Add + equip a magic shield (enriched to "+2"): derives like a mundane
    // shield, no hint.
    await page.getByPlaceholder('Search the catalog to autofill…').fill('Sentinel Shield');
    await page.getByRole('button', { name: 'Add Sentinel Shield', exact: true }).click();
    await expect(page.getByTestId('catalog-gear-hint')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add item', exact: true }).click();
    await page.getByRole('button', { name: 'Equip Sentinel Shield' }).click();
    await expect(page.getByRole('button', { name: 'Unequip Sentinel Shield' })).toBeVisible();

    // AC derives 10 + 2 Dex + 2 shield = 14.
    await page.getByRole('tab', { name: 'Character' }).click();
    await expect(page.getByTestId('ac-block')).toContainText('14');
    await expect(page.getByTestId('ac-breakdown')).toContainText('2 shield');

    // Reload to prove the magic-shield snapshot persisted.
    await page.reload();
    await expect(page.getByTestId('ac-block')).toContainText('14');
  });
});
