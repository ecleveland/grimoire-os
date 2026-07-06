import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-411 — XP → level-up assistant. Awarding XP flips the section to "ready",
// and the guided level-up applies one composite write: level +1, average HP
// gain, an extra hit die. Everything derived — proficiency bonus and the new
// spell-slot tier — updates from the computed-stats layer with no stored-slot
// write, which is exactly what the new 3rd-level slot track proves.

test.describe('character sheet — level up', () => {
  test('owner awards XP and levels a wizard with the average HP gain', async ({ page }) => {
    await registerAndLogin(page, 'level-up', 'Leveler One');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Milo Quillwick',
        class: 'Wizard',
        level: 4,
        // 100 XP short of the 6,500 threshold for level 5.
        experiencePoints: 6400,
        abilityScores: { strength: 8, dexterity: 14, constitution: 14, intelligence: 16 },
        hitPoints: { max: 22, current: 15, temporary: 0 },
        hitDice: { dieType: 'd6', total: 4, spent: 1 },
        spellcastingAbility: 'Intelligence',
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Milo Quillwick' })).toBeVisible();
    await expect(page.getByTestId('level-badge')).toHaveText('4');

    const section = page.getByTestId('level-up-section');
    await expect(section.getByText('6,400 XP')).toBeVisible();
    await expect(section.getByText('100 XP to level 5')).toBeVisible();
    await expect(section.getByText('Ready to level up!')).toHaveCount(0);

    // Award the missing 100 XP — one optimistic-locked write.
    await section.getByLabel('XP to award').fill('100');
    await section.getByRole('button', { name: 'Award XP' }).click();
    await expect(section.getByText('6,500 XP')).toBeVisible();
    await expect(section.getByText('Ready to level up!')).toBeVisible();

    // Guided level-up: 4 → 5 crosses the +2 → +3 proficiency step; the default
    // average d6 gain is 4 + 2 CON = +6 HP.
    await section.getByRole('button', { name: 'Level Up' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Level 4 → 5')).toBeVisible();
    await expect(dialog.getByText('Proficiency bonus: +2 → +3')).toBeVisible();
    await expect(dialog.getByTestId('hp-gain-preview')).toContainText('+6 HP');
    await expect(dialog.getByText(/spell slots and your preparation budget/i)).toBeVisible();
    await dialog.getByRole('button', { name: 'Confirm Level Up' }).click();

    // Level badge, HP (15+6 / 22+6), and the hit-dice pool (4 → 5 total,
    // 1 still spent) all reflect the single composite write.
    await expect(page.getByTestId('level-badge')).toHaveText('5');
    await expect(page.getByTestId('hp-block').getByText('21/28')).toBeVisible();
    await expect(page.getByTestId('hd-block').getByText('1/5')).toBeVisible();

    // The new 3rd-level slot tier appears purely from the computed re-derivation
    // (VEG-412 reconciliation): a level-5 wizard has {1: 4, 2: 3, 3: 2} and the
    // level-up wrote no stored spellSlots at all.
    await page.getByRole('tab', { name: 'Spells & Details' }).click();
    await expect(
      page.getByTestId('spell-slots-level-3').locator('[data-testid="slot-empty"]')
    ).toHaveCount(2);
  });
});
