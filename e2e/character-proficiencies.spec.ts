import { expect, test } from '@playwright/test';
import { registerAndLogin } from './helpers';

// VEG-348 workstream A, slice 3: proficiencies & training are editable —
// saving throws / skills / armor as toggle chips, languages & weapon/tool
// proficiencies as token lists, with a class skill-pool advisory counter.

test.describe('character editor — editable proficiencies', () => {
  test('toggles saves/skills + adds a language, persisted through save', async ({ page }) => {
    await registerAndLogin(page, 'profs');
    await page.goto('/characters/new');

    await page.getByLabel(/^name/i).fill('Prof Hero');

    // Toggle a saving throw and a skill (canonical-set toggle chips).
    await page.getByRole('button', { name: 'Strength', exact: true }).click();
    await page.getByRole('button', { name: 'Athletics', exact: true }).click();

    // Add a language via the token editor.
    const langInput = page.getByLabel('Languages');
    await langInput.fill('Common');
    await langInput.press('Enter');
    await expect(page.getByRole('button', { name: 'Remove Common' })).toBeVisible();

    await page.getByRole('button', { name: /create character/i }).click();
    await expect(page.getByRole('heading', { name: 'Prof Hero' })).toBeVisible();
    // Languages live under the "Spells & Details" tab on the sheet.
    await page.getByRole('tab', { name: /spells & details/i }).click();
    await expect(page.getByText('Common', { exact: true })).toBeVisible();

    // Round-trip: the toggles and language survive a reload into the editor.
    // (The Edit link lives on the Character tab.)
    await page.getByRole('tab', { name: /^character$/i }).click();
    await page.getByRole('link', { name: /edit/i }).first().click();
    await expect(page.getByRole('button', { name: 'Strength', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByRole('button', { name: 'Athletics', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await expect(page.getByRole('button', { name: 'Remove Common' })).toBeVisible();
  });

  test('shows the class skill-pool advisory counter once a class is chosen', async ({ page }) => {
    await registerAndLogin(page, 'profs-pool');
    await page.goto('/characters/new');

    await page.getByLabel(/^name/i).fill('Pool Hero');
    const classInput = page.getByLabel(/^class/i);
    await classInput.click();
    await page.getByRole('listbox').getByRole('option').first().click();

    // The advisory counter appears (non-blocking choose-N).
    await expect(page.getByText(/from your class \(choose \d+\):/i)).toBeVisible();
  });
});
