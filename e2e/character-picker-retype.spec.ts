import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// A homebrew class may share an SRD class's name, and the picker's stored id is
// the only thing telling the two apart. Typing in the field used to drop that id
// on the first keystroke with no way back short of reopening the list, while the
// Class step still let the user advance with no saves, armor, or hit die.
//
// The names below are deliberately not uniquified. The collision is the point.
test.describe('guided builder class picker retype', () => {
  test('a retype keeps the picked class, and an ambiguous name blocks Next', async ({ page }) => {
    await registerAndLogin(page, 'picker-retype', 'E2E Retyper');
    const headers = await csrfHeaders(page);

    // Two collisions: "Fighter" is the one picked, "Wizard" is the ambiguous
    // name typed later. No skill choices, so Next turns on the name alone.
    for (const data of [
      { name: 'Fighter', hitDie: 'd12', savingThrows: ['Dexterity', 'Charisma'] },
      { name: 'Wizard', hitDie: 'd8', savingThrows: ['Wisdom'] },
    ]) {
      const created = await page.request.post(`${BACKEND}/api/srd/classes`, {
        data,
        headers,
      });
      expect(created.status(), await created.text()).toBe(201);
    }

    await page.goto('/characters/new/guided');
    await expect(page.getByRole('heading', { name: /guided character build/i })).toBeVisible();
    const next = page.getByRole('button', { name: /^next$/i });
    const classInput = page.getByRole('combobox', { name: /^class/i });
    const grants = page.getByRole('group', { name: /class grants/i });
    // Scoped to the step: Next.js mounts its own empty route-announcer alert.
    const message = page.getByRole('region', { name: /^class$/i }).getByRole('alert');

    await classInput.click();
    await classInput.fill('Fighter');
    await page.getByRole('option', { name: 'Fighter (Homebrew)' }).click();
    await expect(grants).toContainText('d12');
    await expect(grants).toContainText('Dexterity, Charisma');
    await expect(next).toBeEnabled();

    // A stray key and its backspace, typed the way a user does.
    await classInput.click();
    await classInput.press('End');
    await classInput.pressSequentially('x');
    await expect(grants).toHaveCount(0);
    await classInput.press('Backspace');
    await expect(grants).toContainText('d12');
    await expect(grants).toContainText('Dexterity, Charisma');
    await expect(next).toBeEnabled();

    // Replacing the text with the same name in one edit keeps it too.
    await classInput.fill('fighter');
    await classInput.fill('Fighter');
    await expect(grants).toContainText('d12');
    await expect(next).toBeEnabled();
    await expect(message).toHaveCount(0);

    // A different name that matches two classes resolves to neither.
    await classInput.fill('Wizard');
    await expect(message).toHaveText(
      'More than one class is named "Wizard". Pick one from the list.'
    );
    await expect(grants).toHaveCount(0);
    await expect(next).toBeDisabled();

    // Picking a row clears the message and releases the gate.
    await page.getByRole('option', { name: 'Wizard (SRD)' }).click();
    await expect(message).toHaveCount(0);
    await expect(grants).toContainText('d6');
  });
});
