import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-413 — spell-card detail popover. Clicking a spell name in the sheet's
// "Cantrips & Prepared Spells" table opens a read-only card: catalog-linked
// entries show the full SRD detail; free-typed entries show only stored fields.

test.describe('character sheet — spell-card popover', () => {
  test('opens the full card for a catalog spell and a stored card for a free-typed one', async ({
    page,
  }) => {
    await registerAndLogin(page, 'spell-card', 'Player One');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Orin Cardseer',
        class: 'Wizard',
        level: 5,
        abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 18 },
        hitPoints: { max: 22, current: 22, temporary: 0 },
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
    await expect(page.getByRole('heading', { name: 'Orin Cardseer' })).toBeVisible();
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(page.getByText('Cantrips & Prepared Spells')).toBeVisible();

    // Catalog-linked spell (Fireball is seeded) — the picker sets its spellId.
    await page.getByPlaceholder('Search the catalog to add a spell…').fill('Fireball');
    await page.getByRole('button', { name: 'Add Fireball', exact: true }).click();
    await expect(page.getByTestId('spell-Fireball')).toBeVisible();

    // Free-typed spell — no catalog link.
    await page.getByLabel('New spell name').fill('Homebrew Bolt');
    await page.getByLabel('New spell level').fill('1');
    await page.getByRole('button', { name: 'Add spell' }).click();
    await expect(page.getByTestId('spell-Homebrew Bolt')).toBeVisible();

    // Open the catalog card → full SRD detail (description + casting stats).
    await page.getByRole('button', { name: 'View Fireball details' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /Fireball/ })).toBeVisible();
    await expect(dialog.getByText('Casting Time')).toBeVisible();
    await expect(dialog.getByText('Description')).toBeVisible();
    await expect(dialog.getByTestId('not-linked-hint')).toBeHidden();

    // Escape closes it (shared Modal a11y).
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();

    // Open the free-typed card → stored fields + the not-linked hint.
    await page.getByRole('button', { name: 'View Homebrew Bolt details' }).click();
    const freeDialog = page.getByRole('dialog');
    await expect(freeDialog).toBeVisible();
    await expect(freeDialog.getByRole('heading', { name: /Homebrew Bolt/ })).toBeVisible();
    await expect(freeDialog.getByTestId('not-linked-hint')).toBeVisible();
  });
});
