import { expect, test } from '@playwright/test';
import { registerAndLogin } from './helpers';

// VEG-348 workstream A, slice 4: personality & details are editable —
// appearance / traits / ideals / bonds / flaws / backstory + avatar URL, with
// SRD background suggestions. Values round-trip to the sheet.

test.describe('character editor — personality & details', () => {
  test('fills personality + avatar and shows them on the sheet', async ({ page }) => {
    await registerAndLogin(page, 'personality');
    await page.goto('/characters/new');

    await page.getByLabel(/^name/i).fill('Story Hero');
    await page.getByLabel(/appearance/i).fill('Weathered and tall.');
    await page.getByLabel(/backstory/i).fill('Once a humble farmer.');
    await page.getByLabel(/avatar url/i).fill('https://example.com/portrait.png');

    await page.getByRole('button', { name: /create character/i }).click();
    await expect(page.getByRole('heading', { name: 'Story Hero' })).toBeVisible();

    // Avatar renders in the header.
    await expect(page.getByTestId('character-avatar')).toHaveAttribute(
      'src',
      'https://example.com/portrait.png'
    );
    // Appearance/backstory live under the "Spells & Details" tab.
    await page.getByRole('tab', { name: /spells & details/i }).click();
    await expect(page.getByText('Weathered and tall.')).toBeVisible();
    await expect(page.getByText('Once a humble farmer.')).toBeVisible();
  });

  test('appends an SRD background personality suggestion to its field', async ({ page }) => {
    await registerAndLogin(page, 'personality-suggest');
    await page.goto('/characters/new');

    await page.getByLabel(/^name/i).fill('Suggest Hero');

    // Pick an SRD background so its suggestions appear.
    const bgInput = page.getByLabel(/^background/i);
    await bgInput.click();
    await page.getByRole('option').first().click();

    // The first suggestion row is for Personality Traits; click its first chip
    // and confirm it lands in that textarea.
    const suggestionRow = page.getByText(/suggestions from/i).first();
    await expect(suggestionRow).toBeVisible();
    const chip = suggestionRow.locator('xpath=following-sibling::button[1]');
    const chipText = ((await chip.textContent()) ?? '').trim();
    await chip.click();

    await expect(page.getByLabel('Personality Traits')).toHaveValue(chipText);
  });
});
