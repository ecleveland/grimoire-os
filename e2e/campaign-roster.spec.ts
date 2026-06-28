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
    // Gone from the roster (the row is a link). The name may reappear as an
    // option in the DM's attach picker — detaching frees it to be re-attached
    // (VEG-361) — so assert the roster row specifically, not page-wide text.
    await expect(page.getByRole('link', { name: /lidda roster/i })).toHaveCount(0);

    // Durable: still gone after a reload.
    await page.reload();
    await page.getByRole('button', { name: /^roster$/i }).click();
    await expect(page.getByText(/no characters in this campaign yet/i)).toBeVisible();
  });

  // VEG-361: the owner attaches a member's unattached character from the roster
  // picker. The DM is a member of their own campaign, so their own unattached
  // character is the attachable candidate — exercises the full owner-gated path.
  test('owner attaches a member character from the roster picker', async ({ page }) => {
    await registerAndLogin(page, 'attachbehalf', 'E2E Attach DM');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Attach Camp ${Date.now()}` },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    // An UNATTACHED character owned by the DM (a campaign member) — the picker
    // should offer it (no campaignId on create).
    const charRes = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Tordek Freelance',
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        hitPoints: { max: 14, current: 14, temporary: 0 },
        armorClass: 15,
        speed: 25,
      },
      headers,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();
    const characterId = (await charRes.json()).id as string;

    await page.goto(`/campaigns/${campaignId}`);
    await page.getByRole('button', { name: /^roster$/i }).click();
    await expect(page.getByRole('heading', { name: /party roster/i })).toBeVisible();
    await expect(page.getByText(/no characters in this campaign yet/i)).toBeVisible();

    // Attach via the owner-only picker.
    await page.getByLabel(/add a member/i).selectOption(characterId);
    await page.getByRole('button', { name: /^add$/i }).click();

    await expect(page.getByText(/character added to campaign/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /tordek freelance/i })).toBeVisible();
    // Nothing left to attach → the picker is gone, replaced by the empty-add hint.
    await expect(page.getByLabel(/add a member/i)).toHaveCount(0);
    await expect(page.getByText(/no member characters are available to add/i)).toBeVisible();
  });
});
