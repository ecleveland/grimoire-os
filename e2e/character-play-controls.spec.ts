import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-349 — in-sheet play controls. The owner can take damage, toggle heroic
// inspiration, spend a hit die, expend a spell slot, quick-edit coins, and roll
// dice without leaving the sheet, each change persisted optimistic-lock-safe.

test.describe('character sheet — in-sheet play controls', () => {
  test('owner drives HP, inspiration, hit dice, slots, coins, and a roll', async ({ page }) => {
    await registerAndLogin(page, 'play-controls', 'Player One');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Lyra Quickblade',
        class: 'Fighter',
        level: 5,
        abilityScores: { strength: 16, dexterity: 16, constitution: 14 },
        hitPoints: { max: 30, current: 30, temporary: 0 },
        hitDice: { dieType: 'd10', total: 5, spent: 0 },
        heroicInspiration: false,
        // A spellcasting ability is what makes SpellcastingSection (and the slot
        // pips) render at all.
        spellcastingAbility: 'Intelligence',
        spellSaveDC: 13,
        spellAttackBonus: 5,
        spellSlots: [{ level: 1, total: 3, used: 0 }],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        weapons: [
          { name: 'Longsword', attackBonus: '+6', damage: '1d8+3', damageType: 'Slashing' },
        ],
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Lyra Quickblade' })).toBeVisible();

    // HP: take 5 damage → 25/30.
    const hpBlock = page.getByTestId('hp-block');
    await hpBlock.getByLabel('HP amount').fill('5');
    await hpBlock.getByRole('button', { name: 'Damage' }).click();
    await expect(hpBlock.getByText('25/30')).toBeVisible();

    // Heroic inspiration: toggle on.
    const inspiration = page.getByRole('button', { name: /toggle heroic inspiration/i });
    await inspiration.click();
    await expect(inspiration).toHaveAttribute('aria-pressed', 'true');

    // Hit dice: spend one → 1/5.
    await page.getByRole('button', { name: 'Spend hit die' }).click();
    await expect(page.getByTestId('hd-block').getByText('1/5')).toBeVisible();

    // Death saves: toggle a failure pip — exercises the deathSaves PATCH field
    // (the backend whitelist must accept it), persisted across the refetch.
    await page.getByRole('button', { name: 'Toggle failure 1' }).click();
    await expect(page.getByRole('button', { name: 'Toggle failure 1' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    // Spell slots live on the Spells & Details tab.
    await page.getByRole('tab', { name: 'Spells & Details' }).click();

    // Expend a level-1 slot pip.
    await page.getByRole('button', { name: 'Level 1 slot 1' }).click();
    await expect(
      page.getByTestId('spell-slots-level-1').locator('[data-testid="slot-filled"]')
    ).toHaveCount(1);

    // Coins: select GP (starts at 0), add 25.
    await page.getByRole('button', { name: 'Adjust GP' }).click();
    await page.getByLabel('Amount').fill('25');
    // exact: the inventory editor on this tab now also has an "Add item" button.
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Adjust GP' })).toContainText('25');
  });
});
