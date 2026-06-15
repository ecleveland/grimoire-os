import { expect, test } from '@playwright/test';
import { registerAndLogin } from './helpers';

// VEG-348 workstream A, slice 2: class/subclass/race/background are SRD-driven
// searchable comboboxes (with free-text override), and picking an SRD entity
// offers to autofill its granted proficiencies/saves/etc. — persisted on save.

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('character editor — SRD pickers + autofill', () => {
  test('picks SRD class/race, autofills granted traits, and persists through save', async ({
    page,
  }) => {
    await registerAndLogin(page, 'srd-pickers');
    await page.goto('/characters/new');

    await page.getByLabel(/^name/i).fill('Picker Hero');

    // Class — open the combobox and pick the first SRD option.
    const classInput = page.getByLabel(/^class/i);
    await classInput.click();
    const firstClass = page.getByRole('option').first();
    const className = ((await firstClass.textContent()) ?? '').trim();
    await firstClass.click();
    await expect(classInput).toHaveValue(className);

    // Race — same, in its own combobox.
    const raceInput = page.getByLabel(/^race/i);
    await raceInput.click();
    const firstRace = page.getByRole('option').first();
    const raceName = ((await firstRace.textContent()) ?? '').trim();
    await firstRace.click();
    await expect(raceInput).toHaveValue(raceName);

    // Before autofill no proficiency toggles are selected.
    const pressed = page.locator('button[aria-pressed="true"]');
    await expect(pressed).toHaveCount(0);

    // Autofill the class's granted traits — saves/armor toggles light up.
    await page
      .getByRole('button', { name: new RegExp(`apply ${escapeRegExp(className)} traits`, 'i') })
      .click();
    await expect(pressed.first()).toBeVisible();

    await page.getByRole('button', { name: /create character/i }).click();
    await expect(page.getByRole('heading', { name: 'Picker Hero' })).toBeVisible();

    // Re-open in the editor: the SRD picks and the autofilled grants survived.
    await page.getByRole('link', { name: /edit/i }).first().click();
    await expect(page.getByLabel(/^class/i)).toHaveValue(className);
    await expect(page.getByLabel(/^race/i)).toHaveValue(raceName);
    await expect(page.locator('button[aria-pressed="true"]').first()).toBeVisible();
  });

  test('keeps a homebrew class typed by hand (manual override)', async ({ page }) => {
    await registerAndLogin(page, 'srd-homebrew');
    await page.goto('/characters/new');

    await page.getByLabel(/^name/i).fill('Homebrew Hero');
    await page.getByLabel(/^class/i).fill('Chronomancer');
    // No SRD match → no autofill button offered.
    await expect(page.getByRole('button', { name: /apply .* traits/i })).toHaveCount(0);

    await page.getByRole('button', { name: /create character/i }).click();
    await expect(page.getByRole('heading', { name: 'Homebrew Hero' })).toBeVisible();

    await page.getByRole('link', { name: /edit/i }).first().click();
    await expect(page.getByLabel(/^class/i)).toHaveValue('Chronomancer');
  });
});
