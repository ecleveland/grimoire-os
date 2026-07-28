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

    // Slot maxima come from the class progression, not the stored row (VEG-412):
    // a real L5 Wizard has {1: 4, 2: 3, 3: 2} even though this character was
    // stored with a stale `total: 3` and no L2/L3 rows. The 3 used slots render
    // against the authoritative 4-pip track.
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    const level1 = page.getByTestId('spell-slots-level-1');
    await expect(level1.locator('[data-testid="slot-filled"]')).toHaveCount(3);
    await expect(level1.locator('[data-testid="slot-empty"]')).toHaveCount(1);
    await expect(
      page.getByTestId('spell-slots-level-2').locator('[data-testid="slot-empty"]')
    ).toHaveCount(3);
    await expect(
      page.getByTestId('spell-slots-level-3').locator('[data-testid="slot-empty"]')
    ).toHaveCount(2);
    await page.getByRole('tab', { name: 'Character' }).click();

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

    // Spell slots (Spells & Details tab) reset to unused, still on the
    // authoritative 4-pip track.
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(
      page.getByTestId('spell-slots-level-1').locator('[data-testid="slot-filled"]')
    ).toHaveCount(0);
    await expect(
      page.getByTestId('spell-slots-level-1').locator('[data-testid="slot-empty"]')
    ).toHaveCount(4);
  });

  test('owner long-rests a non-caster whose spellSlots persist as null', async ({ page }) => {
    // Regression for the manual-test crash: a martial character created with no
    // spellcastingAbility/spellSlots has spellSlots === null, and Long Rest must
    // not throw on it.
    await registerAndLogin(page, 'long-rest-martial', 'Rester Two');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Brom Stoutshield',
        class: 'Fighter',
        level: 4,
        abilityScores: { strength: 16, dexterity: 12, constitution: 15 },
        hitPoints: { max: 36, current: 11, temporary: 0 },
        // total 4 → regain max(1, floor(4/2)) = 2; spent 3 → 1 remaining.
        hitDice: { dieType: 'd10', total: 4, spent: 3 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        // No spellcastingAbility and no spellSlots → spellSlots persists as null.
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Brom Stoutshield' })).toBeVisible();

    const hpBlock = page.getByTestId('hp-block');
    await hpBlock.getByRole('button', { name: 'Long Rest' }).click();

    await expect(hpBlock.getByText('36/36')).toBeVisible();
    await expect(page.getByTestId('hd-block').getByText('1/4')).toBeVisible();
  });

  test('short rest recharges only short-rest resources; long rest recharges both (VEG-409)', async ({
    page,
  }) => {
    await registerAndLogin(page, 'rest-resources', 'Rester Three');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Shan Two-Rivers',
        class: 'Monk',
        level: 5,
        abilityScores: { strength: 12, dexterity: 16, constitution: 14, wisdom: 15 },
        hitPoints: { max: 33, current: 33, temporary: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        // Both pools fully spent, so recovery is visible per recharge kind.
        resources: [
          { name: 'Ki Points', max: 5, used: 5, recharge: 'short' },
          { name: 'Luck Points', max: 3, used: 3, recharge: 'long' },
        ],
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Shan Two-Rivers' })).toBeVisible();

    const tracker = page.getByTestId('resource-tracker');
    // Ki (5 pips) and Luck (3 pips) both start fully consumed.
    await expect(
      tracker.locator('[data-testid^="resource-0-pip-"][data-filled="true"]')
    ).toHaveCount(5);
    await expect(
      tracker.locator('[data-testid^="resource-1-pip-"][data-filled="true"]')
    ).toHaveCount(3);

    // Short rest: Ki refills, Luck stays spent. Since VEG-487 the button opens a
    // dialog (hit dice are spendable there); this character has no hit dice, so
    // confirming straight away is a resource-only rest.
    await page.getByRole('button', { name: 'Short Rest' }).click();
    await page.getByRole('button', { name: 'Confirm Short Rest' }).click();
    await expect(
      tracker.locator('[data-testid^="resource-0-pip-"][data-filled="true"]')
    ).toHaveCount(0);
    await expect(
      tracker.locator('[data-testid^="resource-1-pip-"][data-filled="true"]')
    ).toHaveCount(3);

    // Re-spend one Ki so the long rest has something short-recharge to clear too.
    await page.getByRole('button', { name: 'Ki Points use 1' }).click();
    await expect(
      tracker.locator('[data-testid^="resource-0-pip-"][data-filled="true"]')
    ).toHaveCount(1);

    // Long rest: everything refills.
    await page.getByRole('button', { name: 'Long Rest' }).click();
    await expect(
      tracker.locator('[data-testid^="resource-0-pip-"][data-filled="true"]')
    ).toHaveCount(0);
    await expect(
      tracker.locator('[data-testid^="resource-1-pip-"][data-filled="true"]')
    ).toHaveCount(0);
  });

  // VEG-487 — spending hit dice to heal on a short rest, and the long rest's
  // exhaustion step-down.

  test('owner spends hit dice on a short rest to heal', async ({ page }) => {
    await registerAndLogin(page, 'short-rest-dice', 'Rester Four');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Dara Stonewalker',
        class: 'Barbarian',
        level: 4,
        // CON 14 → +2 modifier, so an average d12 (7) heals 9 per die.
        abilityScores: { strength: 16, dexterity: 12, constitution: 14 },
        hitPoints: { max: 40, current: 12, temporary: 0 },
        hitDice: { dieType: 'd12', total: 4, spent: 1 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Dara Stonewalker' })).toBeVisible();

    const hpBlock = page.getByTestId('hp-block');
    await expect(hpBlock.getByText('12/40')).toBeVisible();
    await expect(page.getByTestId('hd-block').getByText('1/4')).toBeVisible();

    await hpBlock.getByRole('button', { name: 'Short Rest' }).click();
    const dialog = page.getByTestId('short-rest-dialog');
    await expect(dialog).toBeVisible();
    // 4 total, 1 spent → 3 available.
    await expect(dialog.getByTestId('dice-available')).toHaveText('3');

    // Spend two dice at the fixed average: 2 × (7 + 2 CON) = 18 healing.
    await dialog.getByRole('button', { name: 'Spend a Hit Die' }).click();
    await dialog.getByRole('button', { name: 'Spend a Hit Die' }).click();
    await expect(dialog.getByTestId('heal-total')).toHaveText('18');
    await expect(dialog.getByTestId('hp-preview')).toHaveText('30');

    await dialog.getByRole('button', { name: 'Confirm Short Rest' }).click();

    await expect(dialog).toBeHidden();
    await expect(hpBlock.getByText('30/40')).toBeVisible();
    // Two more dice spent: 1 → 3.
    await expect(page.getByTestId('hd-block').getByText('3/4')).toBeVisible();
  });

  test('long rest reduces exhaustion by one level', async ({ page }) => {
    await registerAndLogin(page, 'long-rest-exhaustion', 'Rester Five');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Kelen Ashgrove',
        class: 'Ranger',
        level: 3,
        abilityScores: { strength: 12, dexterity: 16, constitution: 13 },
        hitPoints: { max: 24, current: 24, temporary: 0 },
        hitDice: { dieType: 'd10', total: 3, spent: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        exhaustion: 3,
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Kelen Ashgrove' })).toBeVisible();
    // Pips 1-3 filled. (Asserted via the track's own testids rather than the
    // "Level 3" label, which would also match the character's level elsewhere.)
    await expect(page.getByTestId('exhaustion-pip-3')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('hp-block').getByRole('button', { name: 'Long Rest' }).click();

    // Stepped down 3 → 2: the third pip empties, the second stays filled.
    await expect(page.getByTestId('exhaustion-pip-3')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('exhaustion-pip-2')).toHaveAttribute('aria-pressed', 'true');
  });
});
