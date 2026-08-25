import { expect, test } from '@playwright/test';
import { registerAndLogin } from './helpers';

// VEG-348 workstream A, slice 5: the weapons table and features/traits/feats
// editors. A feature whose source matches the class shows under Class Features.

test.describe('character editor — weapons & features', () => {
  test('adds a weapon and a class feature, shown on the sheet', async ({ page }) => {
    await registerAndLogin(page, 'weapons-features');
    await page.goto('/characters/new');

    await page.getByLabel(/^name/i).fill('Martial Hero');

    // Pick an SRD class so the feature can be categorized under Class Features.
    const classInput = page.getByLabel(/^class/i);
    await classInput.click();
    const firstClass = page.getByRole('listbox').getByRole('option').first();
    const className = ((await firstClass.textContent()) ?? '').trim();
    await firstClass.click();

    // Weapon row.
    await page.getByRole('button', { name: /add weapon/i }).click();
    await page.getByLabel('Weapon name').fill('Greataxe');
    await page.getByLabel('Damage', { exact: true }).fill('1d12');

    // Feature row sourced to the class.
    await page.getByRole('button', { name: /add feature/i }).click();
    await page.getByLabel('Feature name').fill('Battle Fury');
    await page.getByLabel('Feature source').fill(className);

    await page.getByRole('button', { name: /create character/i }).click();
    await expect(page.getByRole('heading', { name: 'Martial Hero' })).toBeVisible();

    // Both render on the default Character tab (WeaponsTable + ClassFeatures).
    await expect(page.getByText('Greataxe')).toBeVisible();
    await expect(page.getByText('Battle Fury')).toBeVisible();
  });
});
