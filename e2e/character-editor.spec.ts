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

// VEG-500. VEG-496 bounded these columns at the DTO write boundary; the editor
// kept accepting values the server would refuse, so the user met the limit as a
// 400 toast. jsdom only approximates a real number input's value sanitization,
// so the keystroke path below (a typed minus sign) needs a real browser to mean
// anything.
test.describe('character editor — bounded numeric inputs', () => {
  test('pins an over-max speed and accepts a typed negative initiative bonus', async ({ page }) => {
    await registerAndLogin(page, 'char-bounds');

    // The sheet carries a "Roll initiative" button, so a loose /initiative/i
    // matches a non-input as soon as this leaves the editor. Name the field.
    const speedField = () => page.getByLabel('Speed', { exact: true });
    const initiativeField = () => page.getByLabel('Initiative Bonus', { exact: true });
    // The editor is a client component reached by a link, so wait for it to
    // mount before reading a field rather than racing the navigation.
    const openEditor = async (submitLabel: RegExp) => {
      await page.getByRole('link', { name: /edit/i }).first().click();
      await expect(page.getByRole('button', { name: submitLabel })).toBeVisible();
    };

    await page.goto('/characters/new');
    await page.getByLabel(/^name/i).fill('Bounded Bardolph');

    // Past the ceiling: the control pins it rather than letting the write 400.
    await speedField().fill('5000');
    await expect(speedField()).toHaveValue('999');

    // A lone "-" is not a valid number, so the browser reports '' for it
    // mid-keystroke. Typing character by character is the case that used to eat
    // the minus sign and leave "3".
    await initiativeField().clear();
    await initiativeField().pressSequentially('-3');
    await expect(initiativeField()).toHaveValue('-3');

    await page.getByRole('button', { name: /create character/i }).click();
    await expect(page.getByRole('heading', { name: 'Bounded Bardolph' })).toBeVisible();

    // Both survive the round trip rather than being clamped only on screen.
    await openEditor(/save changes/i);
    await expect(speedField()).toHaveValue('999');
    await expect(initiativeField()).toHaveValue('-3');

    // Blanking the bonus saves 0, not null — it is a flat bonus, and no bonus
    // is zero.
    await initiativeField().clear();
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByRole('heading', { name: 'Bounded Bardolph' })).toBeVisible();
    await openEditor(/save changes/i);
    await expect(initiativeField()).toHaveValue('0');
  });
});
