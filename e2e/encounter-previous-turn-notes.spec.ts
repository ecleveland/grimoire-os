import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Previous turn + combatant notes (VEG-289)', () => {
  test('DM steps back through turns and edits a note that persists', async ({ page }) => {
    await registerAndLogin(page, 'prevturn', 'E2E Prev-Turn DM');
    // Fixture ships one PC, "Hero", at round 1 / turn 0.
    const { campaignId, encounterId } = await createEncounter(page, 'Prev Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    const prev = page.getByRole('button', { name: /previous turn/i });
    // Clamped at the very start.
    await expect(prev).toBeDisabled();

    await page.getByRole('button', { name: /next turn/i }).click();
    await expect(page.getByText(/round 2/i)).toBeVisible();
    await expect(prev).toBeEnabled();

    await prev.click();
    await expect(page.getByText(/round 1/i)).toBeVisible();
    await expect(prev).toBeDisabled();

    // Notes: edit, commit on Enter, and confirm it survives a reload.
    const heroNotes = page.getByLabel('Notes for Hero', { exact: true });
    await heroNotes.fill('bloodied below 12');
    await Promise.all([
      page.waitForResponse(r => /\/encounters\//.test(r.url()) && r.request().method() === 'PATCH'),
      heroNotes.press('Enter'),
    ]);

    await page.reload();
    await expect(page.getByLabel('Notes for Hero', { exact: true })).toHaveValue(
      'bloodied below 12'
    );
  });
});
