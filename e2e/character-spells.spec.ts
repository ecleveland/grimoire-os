import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-404 (Workstream C, slice 3) — spell management on the character sheet.
// The owner can add (free-typed or catalog-linked), toggle prepared, and remove
// spells in the "Cantrips & Prepared Spells" table, each change optimistic-lock-safe.

test.describe('character sheet — spell management', () => {
  test('owner adds, prepares, removes, and catalog-links spells', async ({ page }) => {
    await registerAndLogin(page, 'spell-mgmt', 'Player One');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Mirella Spellweave',
        class: 'Wizard',
        level: 5,
        abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 18 },
        hitPoints: { max: 22, current: 22, temporary: 0 },
        // A spellcasting ability is what makes SpellcastingSection render.
        spellcastingAbility: 'Intelligence',
        spellSaveDC: 15,
        spellAttackBonus: 7,
        spells: [],
        spellSlots: [{ level: 1, total: 4, used: 0 }],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Mirella Spellweave' })).toBeVisible();

    // Spells live on the Spells & Details tab.
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(page.getByText('Cantrips & Prepared Spells')).toBeVisible();

    // Add a free-typed level-1 spell (defaults to prepared).
    await page.getByLabel('New spell name').fill('Shield');
    await page.getByLabel('New spell level').fill('1');
    await page.getByRole('button', { name: 'Add spell' }).click();
    const shieldRow = page.getByTestId('spell-Shield');
    await expect(shieldRow).toBeVisible();
    await expect(shieldRow.getByTestId('prepared-yes')).toBeVisible();

    // Toggle it un-prepared.
    await page.getByRole('button', { name: 'Toggle prepared Shield' }).click();
    await expect(shieldRow.getByTestId('prepared-no')).toBeVisible();

    // Add a catalog-linked spell (Fireball is seeded in the SRD) — metadata autofills.
    await page.getByPlaceholder('Search the catalog to add a spell…').fill('Fireball');
    await page.getByRole('button', { name: 'Add Fireball', exact: true }).click();
    const fireballRow = page.getByTestId('spell-Fireball');
    await expect(fireballRow).toBeVisible();
    // Fireball carries a Material component flag from the catalog.
    await expect(fireballRow.getByTestId('flag-material')).toBeVisible();

    // Remove the Shield.
    await page.getByRole('button', { name: 'Remove Shield' }).click();
    await expect(page.getByTestId('spell-Shield')).toBeHidden();

    // Reload to prove the writes persisted (Fireball survives, Shield gone).
    await page.reload();
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(page.getByTestId('spell-Fireball')).toBeVisible();
    await expect(page.getByTestId('spell-Shield')).toBeHidden();
  });
});
