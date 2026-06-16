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

    // Advance through the optional stub steps to Review (Fighter has no Spells step).
    for (const heading of [/origin/i, /abilities/i, /equipment/i]) {
      await next.click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    await next.click();
    await expect(page.getByRole('heading', { name: /review/i })).toBeVisible();

    // Create is gated until the character is named.
    const create = page.getByRole('button', { name: /create character/i });
    await expect(create).toBeDisabled();
    await page.getByRole('textbox', { name: /name/i }).fill('Borin Quickblade');
    await expect(create).toBeEnabled();
    await create.click();

    await expect(page.getByRole('heading', { name: 'Borin Quickblade' })).toBeVisible();
  });
});
