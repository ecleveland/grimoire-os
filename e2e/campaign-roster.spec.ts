import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// The campaign owner attaches their own character (via the API, the slice-2
// path), then manages the roster on the campaign page: sees it and detaches it.
test.describe('Campaign roster + DM management (VEG-345)', () => {
  test('owner sees the roster and can remove a character', async ({ page }) => {
    await registerAndLogin(page, 'roster', 'E2E Roster DM');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Roster Camp ${Date.now()}` },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    // Create a character already attached to the campaign (slice-2 create-time path).
    const charRes = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Lidda Roster',
        campaignId,
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        hitPoints: { max: 12, current: 12, temporary: 0 },
        armorClass: 13,
        speed: 30,
      },
      headers,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();

    await page.goto(`/campaigns/${campaignId}`);
    await page.getByRole('button', { name: /^roster$/i }).click();
    await expect(page.getByRole('heading', { name: /party roster/i })).toBeVisible();
    await expect(page.getByText('Lidda Roster')).toBeVisible();

    // Detach via the owner control + confirm dialog.
    await page.getByRole('button', { name: /remove lidda roster/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(/remove character/i);
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(page.getByText(/character removed from campaign/i)).toBeVisible();
    await expect(page.getByText('Lidda Roster')).toHaveCount(0);

    // Durable: still gone after a reload.
    await page.reload();
    await page.getByRole('button', { name: /^roster$/i }).click();
    await expect(page.getByText(/no characters in this campaign yet/i)).toBeVisible();
  });
});
