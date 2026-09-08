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

  // VEG-454. The dedupe was keyed on name + source, which lost nothing while a
  // class could carry one feature name at one level. VEG-507 widened the unique
  // key to [classId, name, level] so an author can write Ability Score
  // Improvement the way every real class does, and the guard then swallowed every
  // occurrence after the first — silently, on the main path.
  //
  // What this covers that the unit suites cannot: `level` is a new field on the
  // stored `Feature`, and `forbidNonWhitelisted` strips or 400s anything not on
  // `CreateCharacterDto`. `class FeatureDto implements Feature` compiles either
  // way and the mocked-PATCH unit tests pass either way — only a real round trip
  // through the pipe proves the level survives both the POST and the level-up
  // PATCH. That is the VEG-349 deathSaves trap.
  test('re-offers a recurring feature name at each level a homebrew class grants it', async ({
    page,
  }) => {
    await registerAndLogin(page, 'level-up-recurring', 'Leveler Two');
    const headers = await csrfHeaders(page);
    const className = `Warden ${Date.now()}`;

    const classRes = await page.request.post(`${BACKEND}/api/srd/classes`, {
      data: {
        name: className,
        hitDie: 'd10',
        features: [
          { name: 'Ability Score Improvement', level: 2, description: 'Raise an ability score.' },
          { name: 'Ability Score Improvement', level: 3, description: 'Raise an ability score.' },
        ],
      },
      headers,
    });
    expect(classRes.ok(), `class create failed: ${classRes.status()}`).toBeTruthy();

    // Level 2, already holding the level-2 grant — the state the sheet would be
    // in after leveling into it. The stored `level: 2` is what the DTO has to
    // accept and echo back.
    const charRes = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Bryn Oakenshield',
        class: className,
        level: 2,
        abilityScores: { strength: 16, dexterity: 12, constitution: 14 },
        hitPoints: { max: 20, current: 20, temporary: 0 },
        hitDice: { dieType: 'd10', total: 2, spent: 0 },
        features: [
          {
            name: 'Ability Score Improvement',
            source: className,
            level: 2,
            description: 'Raise an ability score.',
          },
        ],
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();
    const created = await charRes.json();
    // The write boundary accepted `level` rather than stripping it.
    expect(created.features[0]).toMatchObject({ name: 'Ability Score Improvement', level: 2 });
    const characterId = created.id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByTestId('level-badge')).toHaveText('2');
    await expect(
      page.getByTestId('class-features').getByText('Ability Score Improvement', { exact: true })
    ).toHaveCount(1);

    // 2 → 3 grants the second Ability Score Improvement. Before the fix the
    // section rendered nothing and the patch carried no feature at all.
    await page.getByTestId('level-up-section').getByRole('button', { name: 'Level Up' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Level 2 → 3')).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Ability Score Improvement' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Confirm Level Up' }).click();

    // Both grants now sit on the sheet, rendered without a duplicate React key.
    await expect(page.getByTestId('level-badge')).toHaveText('3');
    await expect(
      page.getByTestId('class-features').getByText('Ability Score Improvement', { exact: true })
    ).toHaveCount(2);

    // And the level-3 copy persisted — the PATCH kept the field too.
    const reread = await page.request.get(`${BACKEND}/api/characters/${characterId}`);
    expect(reread.ok()).toBeTruthy();
    const levels = ((await reread.json()).features as { level?: number }[]).map(f => f.level);
    expect(levels).toEqual([2, 3]);
  });
});
