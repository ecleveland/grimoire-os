import { expect, test } from '@playwright/test';
import { registerAndLogin } from './helpers';

// VEG-348 workstream A, slice 1: the sectioned character editor covers identity
// (incl. size), ability scores, and combat (AC / initiative / HP+temp / hit
// dice), and the edit form round-trips those values with optimistic locking.

test.describe('character editor — identity / abilities / combat', () => {
  test('creates a character with the new fields and round-trips them through edit', async ({
    page,
  }) => {
    await registerAndLogin(page, 'char-editor');

    // ── Create ───────────────────────────────────────────────
    await page.goto('/characters/new');
    await page.getByLabel(/^name/i).fill('Borin Hit-Dice');
    await page.getByLabel(/^size$/i).selectOption('Large');
    await page.getByLabel('STR').fill('17');
    await page.getByLabel(/armor class/i).fill('16');
    await page.getByLabel(/initiative/i).fill('2');
    await page.getByLabel(/max hp/i).fill('30');
    await page.getByLabel(/current hp/i).fill('30');
    await page.getByLabel(/hit die$/i).selectOption('d10');
    await page.getByLabel(/hit dice total/i).fill('3');
    await page.getByLabel(/hit dice spent/i).fill('1');
    await page.getByRole('button', { name: /create character/i }).click();

    // Lands on the sheet; CombatBar reflects AC and hit dice from what we saved.
    await expect(page.getByRole('heading', { name: 'Borin Hit-Dice' })).toBeVisible();
    await expect(page.getByTestId('ac-block')).toContainText('16');
    const hd = page.getByTestId('hd-block');
    await expect(hd).toContainText('1/3');
    await expect(hd).toContainText('d10');

    // ── Edit (prefill + change + save with optimistic lock) ──
    await page.getByRole('link', { name: /edit/i }).first().click();
    await expect(page.getByLabel(/^name/i)).toHaveValue('Borin Hit-Dice');
    await expect(page.getByLabel(/^size$/i)).toHaveValue('Large');
    await expect(page.getByLabel(/hit die$/i)).toHaveValue('d10');

    await page.getByLabel(/^name/i).fill('Borin Renamed');
    await page.getByLabel(/temp hp/i).fill('5');
    await page.getByRole('button', { name: /save changes/i }).click();

    await expect(page.getByRole('heading', { name: 'Borin Renamed' })).toBeVisible();
    await expect(page.getByTestId('hp-block')).toContainText('+5 temp');

    // Persisted across a reload.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Borin Renamed' })).toBeVisible();
    await expect(page.getByTestId('hd-block')).toContainText('d10');
  });
});
