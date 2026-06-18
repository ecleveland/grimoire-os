import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-405 — spell preparation limit indicator. The sheet resolves the class's
// spellcasting progression (/srd/classes) and shows held-vs-allowed for cantrips
// and leveled spells in the "Cantrips & Prepared Spells" card.

test.describe('character sheet — spell preparation indicator', () => {
  test('shows cantrip and prepared budgets against the class allowance', async ({ page }) => {
    await registerAndLogin(page, 'spell-prep', 'Player One');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Selene Glimmer',
        class: 'Wizard',
        level: 5,
        abilityScores: { strength: 8, dexterity: 14, constitution: 12, intelligence: 18 },
        hitPoints: { max: 22, current: 22, temporary: 0 },
        spellcastingAbility: 'Intelligence',
        spellSaveDC: 15,
        spellAttackBonus: 7,
        spells: [
          { level: 0, name: 'Fire Bolt' },
          { level: 0, name: 'Light' },
          { level: 1, name: 'Magic Missile', prepared: true },
          { level: 1, name: 'Shield', prepared: false },
        ],
        spellSlots: [{ level: 1, total: 4, used: 0 }],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Selene Glimmer' })).toBeVisible();

    await page.getByRole('tab', { name: 'Spells & Details' }).click();

    const summary = page.getByTestId('prep-summary');
    await expect(summary).toBeVisible();
    // Held counts are seed-independent: 2 cantrips, 1 prepared leveled spell
    // (Magic Missile; Shield is un-prepared). The allowance comes from the
    // seeded Wizard progression, so assert only the held side strictly.
    await expect(page.getByTestId('cantrip-summary')).toContainText(/Cantrips 2 \/ \d+/);
    await expect(page.getByTestId('leveled-summary')).toContainText(/Prepared 1 \/ \d+/);
  });
});
