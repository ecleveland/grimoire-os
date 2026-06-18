import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-407 — one-click Long Rest. From a depleted state (low HP + temp, spent
// hit dice, used spell slots, death saves marked) a single Long Rest restores
// HP to max, clears temp HP, regains half the hit dice (rounded down, min 1),
// resets every spell slot, and clears death saves — one optimistic-locked write.

test.describe('character sheet — Long Rest', () => {
  test('owner long-rests a depleted character back to full', async ({ page }) => {
    await registerAndLogin(page, 'long-rest', 'Rester One');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Wynn Emberfall',
        class: 'Wizard',
        level: 5,
        abilityScores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 16 },
        hitPoints: { max: 30, current: 8, temporary: 4 },
        // total 5 → regain max(1, floor(5/2)) = 2; spent 4 → 2 remaining.
        hitDice: { dieType: 'd6', total: 5, spent: 4 },
        spellcastingAbility: 'Intelligence',
        spellSaveDC: 13,
        spellAttackBonus: 5,
        spellSlots: [{ level: 1, total: 3, used: 3 }],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Wynn Emberfall' })).toBeVisible();

    const hpBlock = page.getByTestId('hp-block');
    await expect(hpBlock.getByText('8/30')).toBeVisible();
    await expect(hpBlock.getByText('+4 temp')).toBeVisible();

    // Mark a death-save failure pip so the rest has something to clear.
    await page.getByRole('button', { name: 'Toggle failure 1' }).click();
    await expect(page.getByRole('button', { name: 'Toggle failure 1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // One click rests.
    await hpBlock.getByRole('button', { name: 'Long Rest' }).click();

    // HP back to max, temp HP gone.
    await expect(hpBlock.getByText('30/30')).toBeVisible();
    await expect(hpBlock.getByText(/temp/)).toHaveCount(0);
    // Half the hit dice regained: spent 4 → 2.
    await expect(page.getByTestId('hd-block').getByText('2/5')).toBeVisible();
    // Death saves cleared.
    await expect(page.getByRole('button', { name: 'Toggle failure 1' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );

    // Spell slots (Spells & Details tab) reset to unused.
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(
      page.getByTestId('spell-slots-level-1').locator('[data-testid="slot-filled"]')
    ).toHaveCount(0);
  });
});
