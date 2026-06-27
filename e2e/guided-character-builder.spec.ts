import { expect, test } from '@playwright/test';
import { registerAndLogin } from './helpers';

// VEG-378 shell + VEG-379 Class step. Golden path: reach the guided wizard, pick
// an SRD class (Fighter — a non-caster, so the Spells step stays hidden), satisfy
// the skill-count gate, advance through the optional stub steps, name + create,
// and land on the new character's sheet.

test.describe('guided character builder — class selection', () => {
  test('builds a character through the wizard and lands on the sheet', async ({ page }) => {
    await registerAndLogin(page, 'guided-builder');

    await page.goto('/characters/new');
    await page.getByRole('link', { name: /guided builder/i }).click();
    await expect(page.getByRole('heading', { name: /guided character build/i })).toBeVisible();

    // Class step — Next is gated until a class (and its required skills) are chosen.
    const next = page.getByRole('button', { name: /^next$/i });
    await expect(next).toBeDisabled();

    const classInput = page.getByRole('combobox', { name: /^class/i });
    await classInput.click();
    await classInput.fill('Fighter');
    await page.getByRole('option', { name: 'Fighter' }).click();

    // The class grants are summarized (hit die filled in from the SRD class).
    await expect(page.getByRole('group', { name: /class grants/i })).toContainText('d10');

    // Still gated until the class skill count is satisfied — pick the first two.
    await expect(next).toBeDisabled();
    const skillChips = page.getByRole('group', { name: /skills/i }).getByRole('button');
    await skillChips.nth(0).click();
    await skillChips.nth(1).click();
    await expect(next).toBeEnabled();

    // Origin step — pick a background and species; their grants are summarized.
    await next.click();
    await expect(page.getByRole('heading', { name: /origin/i })).toBeVisible();
    const background = page.getByRole('combobox', { name: /background/i });
    await background.click();
    // First background alphabetically is Acolyte, whose origin feat is Magic
    // Initiate (Cleric) — the grant card surfaces it (VEG-430).
    await page.getByRole('option').first().click();
    const backgroundGrants = page.getByRole('group', { name: /background grants/i });
    await expect(backgroundGrants).toBeVisible();
    await expect(backgroundGrants).toContainText('Magic Initiate (Cleric)');
    const species = page.getByRole('combobox', { name: /species/i });
    await species.click();
    await page.getByRole('option').first().click();
    await expect(page.getByRole('group', { name: /species grants/i })).toBeVisible();

    // Abilities step — use point-buy and spend a couple points; the live preview
    // reflects the change.
    await next.click();
    await expect(page.getByRole('heading', { name: /abilities/i })).toBeVisible();
    await page.getByRole('radio', { name: /point buy/i }).click();
    await expect(page.getByTestId('points-remaining')).toHaveText('27');
    await page.getByRole('button', { name: /increase strength/i }).click();
    await page.getByRole('button', { name: /increase strength/i }).click();
    await expect(page.getByTestId('score-strength')).toHaveText('10');
    await expect(page.getByTestId('mod-strength')).toHaveText('+0');

    // Equipment step — take the class starting equipment: pick the first bundle in
    // each choice group and confirm the resolution lands in the draft inventory.
    await next.click();
    await expect(page.getByRole('heading', { name: /equipment/i })).toBeVisible();
    const choiceGroups = page.getByRole('group', { name: /equipment choice/i });
    const groupCount = await choiceGroups.count();
    for (let i = 0; i < groupCount; i++) {
      await choiceGroups.nth(i).getByRole('radio').first().check();
    }
    const resolved = page.getByRole('region', { name: /resolved equipment/i });
    await expect(resolved).toContainText(/chain mail/i);

    // Switching to the gold alternative clears the items and fills the purse.
    await page.getByRole('radio', { name: /take starting gold/i }).click();
    await expect(resolved).not.toContainText(/chain mail/i);
    await expect(page.getByTestId('starting-gp')).not.toHaveText('0');

    await next.click();
    await expect(page.getByRole('heading', { name: /review/i })).toBeVisible();

    // Create is gated until the character is named.
    const create = page.getByRole('button', { name: /create character/i });
    await expect(create).toBeDisabled();
    await page.getByRole('textbox', { name: /name/i }).fill('Borin Quickblade');
    await expect(create).toBeEnabled();
    await create.click();

    await expect(page.getByRole('heading', { name: 'Borin Quickblade' })).toBeVisible();
    // The granted origin feat persists onto the sheet's Feats section (VEG-430).
    const feats = page.getByRole('heading', { name: /^Feats$/ }).locator('..');
    await expect(feats).toContainText('Magic Initiate');
    await expect(feats).toContainText('(Cleric)');
  });

  // VEG-383 Spells step: a caster class surfaces the otherwise-hidden Spells step
  // and lets the user pick cantrips + level-1 spells, which land on the sheet.
  test('shows the Spells step for a caster and records the selections', async ({ page }) => {
    await registerAndLogin(page, 'guided-caster');

    await page.goto('/characters/new/guided');
    await expect(page.getByRole('heading', { name: /guided character build/i })).toBeVisible();

    // Class — Wizard (a caster). Satisfy the skill-count gate.
    const classInput = page.getByRole('combobox', { name: /^class/i });
    await classInput.click();
    await classInput.fill('Wizard');
    await page.getByRole('option', { name: 'Wizard' }).click();
    const skillChips = page.getByRole('group', { name: /skills/i }).getByRole('button');
    await skillChips.nth(0).click();
    await skillChips.nth(1).click();

    const next = page.getByRole('button', { name: /^next$/i });
    // Advance through Origin, Abilities, Equipment to the Spells step.
    await next.click(); // Origin
    await next.click(); // Abilities
    await next.click(); // Equipment
    await next.click(); // Spells

    await expect(page.getByRole('heading', { name: /spells/i })).toBeVisible();

    // Wizard at level 1 with default INT (10): 3 cantrips, 1 prepared spell.
    const cantrips = page.getByRole('group', { name: /cantrips/i });
    const cantripBoxes = cantrips.getByRole('checkbox');
    await cantripBoxes.nth(0).check();
    await cantripBoxes.nth(1).check();
    await cantripBoxes.nth(2).check();

    const prepared = page.getByRole('group', { name: /prepared spells/i });
    await prepared.getByRole('checkbox').first().check();

    await next.click();
    await expect(page.getByRole('heading', { name: /review/i })).toBeVisible();
    await page.getByRole('textbox', { name: /name/i }).fill('Mialee Spellweave');
    await page.getByRole('button', { name: /create character/i }).click();

    // Lands on the sheet; the chosen spells reach the spell table (Spells tab).
    await expect(page.getByRole('heading', { name: 'Mialee Spellweave' })).toBeVisible();
    await page.getByRole('tab', { name: /spells & details/i }).click();
    await expect(page.getByText(/cantrips & prepared spells/i)).toBeVisible();
  });
});
