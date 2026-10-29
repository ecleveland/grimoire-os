import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-644. The History section on the sheet lists the character's snapshots.
// What this proves that the unit suites cannot: the level-up PATCH makes the
// backend store a snapshot, and the row appears with no reload because the
// character write invalidates every cached path under /characters/:id, the
// snapshot list included. It also proves the save body survives the real
// validation pipe, since the mocked apiFetch in Vitest accepts any body.

test.describe('character sheet history', () => {
  test('owner sees the level-up snapshot, saves a labelled one and deletes it', async ({
    page,
  }) => {
    await registerAndLogin(page, 'history', 'Historian');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Rook Ashfall',
        class: 'Fighter',
        level: 1,
        abilityScores: {
          strength: 16,
          dexterity: 12,
          constitution: 14,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        hitPoints: { max: 12, current: 12, temporary: 0 },
        hitDice: { dieType: 'd10', total: 1, spent: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Rook Ashfall' })).toBeVisible();

    const history = page.getByTestId('character-history');
    await expect(history.getByText('No snapshots yet')).toBeVisible();

    // Level 1 to 2. The backend keeps a "Level 1" copy of the sheet as it was.
    await page.getByTestId('level-up-section').getByRole('button', { name: 'Level Up' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm Level Up' }).click();
    await expect(page.getByTestId('level-badge')).toHaveText('2');

    const rows = history.getByTestId('snapshot-row');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Level 1');

    // A labelled snapshot taken by hand lands at the top of the list.
    await history.getByRole('button', { name: 'Save snapshot' }).click();
    const saveDialog = page.getByTestId('save-snapshot-dialog');
    await saveDialog.getByLabel('Label').fill('Before the dragon fight');
    await saveDialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saved snapshot')).toBeVisible();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('Level 2 · Before the dragon fight');

    // Deleting asks first, then the list drops back to the level-up copy.
    await history.getByRole('button', { name: /delete snapshot level 2/i }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm.getByText('Delete snapshot?')).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete' }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Level 1');
  });
});
