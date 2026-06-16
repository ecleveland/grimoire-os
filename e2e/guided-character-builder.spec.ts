import { expect, test } from '@playwright/test';
import { registerAndLogin } from './helpers';

// VEG-378: the guided character-creation wizard shell. Steps render as stubs for
// now (the per-step slices land in VEG-379…383); this exercises the shell's
// golden path — reach it from the classic create page, gate Next on the required
// class choice, skip the optional stub steps, name + create on Review, and land
// on the new character's sheet.

test.describe('guided character builder — wizard shell', () => {
  test('builds a minimal character through the wizard and lands on the sheet', async ({ page }) => {
    await registerAndLogin(page, 'guided-builder');

    // Reach the wizard from the classic create page's entry point.
    await page.goto('/characters/new');
    await page.getByRole('link', { name: /guided builder/i }).click();
    await expect(page.getByRole('heading', { name: /guided character build/i })).toBeVisible();

    // Class step — Next is gated until a class is chosen.
    const next = page.getByRole('button', { name: /^next$/i });
    await expect(next).toBeDisabled();
    await page.getByRole('textbox', { name: /class/i }).fill('Wizard');
    await expect(next).toBeEnabled();

    // Advance through the optional stub steps to Review.
    for (const heading of [/origin/i, /abilities/i, /equipment/i, /spells/i]) {
      await next.click();
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    await next.click();
    await expect(page.getByRole('heading', { name: /review/i })).toBeVisible();

    // Create is gated until the character is named.
    const create = page.getByRole('button', { name: /create character/i });
    await expect(create).toBeDisabled();
    await page.getByRole('textbox', { name: /name/i }).fill('Mialee Quickfingers');
    await expect(create).toBeEnabled();
    await create.click();

    // Lands on the freshly created character's sheet.
    await expect(page.getByRole('heading', { name: 'Mialee Quickfingers' })).toBeVisible();
  });
});
