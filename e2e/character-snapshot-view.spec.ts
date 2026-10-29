import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-645. The History section's View link opens a snapshot as a read-only
// sheet. What this proves that the unit suites cannot: the stored sheet comes
// back through the real snapshot DTO and renders with the pre-level-up level
// and HP, and the page under the real backend shows the owner no write
// controls. The Vitest specs feed the page a hand-built snapshot instead.

test.describe('character snapshot view', () => {
  test('owner opens the level-up snapshot as a read-only sheet and goes back', async ({ page }) => {
    await registerAndLogin(page, 'snapshot-view', 'Viewer');
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

    // Level 1 to 2. The backend keeps a "Level 1" copy of the sheet as it was.
    await page.getByTestId('level-up-section').getByRole('button', { name: 'Level Up' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm Level Up' }).click();
    await expect(page.getByTestId('level-badge')).toHaveText('2');

    await page
      .getByTestId('character-history')
      .getByRole('link', { name: /view snapshot level 1/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/characters/${characterId}/history/[0-9a-f-]{36}$`));

    const banner = page.getByTestId('snapshot-banner');
    await expect(banner).toContainText('Rook Ashfall at level 1, saved');
    await expect(banner).toContainText('Read only.');
    await expect(page.getByTestId('level-badge')).toHaveText('1');
    await expect(page.getByTestId('hp-block').getByText('12/12')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Level Up' })).toHaveCount(0);
    await expect(page.getByTestId('character-history')).toHaveCount(0);

    await banner.getByRole('link', { name: 'Back to the current sheet' }).click();
    await expect(page).toHaveURL(new RegExp(`/characters/${characterId}$`));
    await expect(page.getByTestId('level-badge')).toHaveText('2');
  });
});
