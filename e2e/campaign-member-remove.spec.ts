import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// VEG-360: the DM removes a player from a campaign via the roster Members list.
// The owner sets up the campaign + invite code; a second user joins and attaches
// a character, then the DM removes them — which detaches the player's character
// and drops them off the member list (complements the player-facing Leave flow).
test.describe('DM removes a player from a campaign (VEG-360)', () => {
  test('owner removes a member: their character is detached and the member drops off', async ({
    page,
    browser,
  }) => {
    // DM creates a campaign and mints an invite code.
    await registerAndLogin(page, 'removedm', 'E2E Remove DM');
    const dmHeaders = await csrfHeaders(page);
    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Remove Target ${Date.now()}` },
      headers: dmHeaders,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaign = await campRes.json();
    const campaignId = campaign.id as string;
    const campaignName = campaign.name as string;

    const inviteRes = await page.request.post(
      `${BACKEND}/api/campaigns/${campaignId}/invite-code`,
      { headers: dmHeaders }
    );
    expect(inviteRes.ok(), `invite code failed: ${inviteRes.status()}`).toBeTruthy();
    const inviteCode = (await inviteRes.json()).inviteCode as string;

    // A second user joins and attaches a character to the campaign.
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await registerAndLogin(playerPage, 'removeplayer', 'Booted Bran');
    const playerHeaders = await csrfHeaders(playerPage);

    const joinRes = await playerPage.request.post(
      `${BACKEND}/api/campaigns/join/${inviteCode}`,
      { headers: playerHeaders }
    );
    expect(joinRes.ok(), `join failed: ${joinRes.status()}`).toBeTruthy();

    const charRes = await playerPage.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Bran Boltthrower',
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
        armorClass: 12,
        speed: 30,
      },
      headers: playerHeaders,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();
    const characterId = (await charRes.json()).id as string;

    // The DM opens the roster and removes the player via the Members list.
    await page.goto(`/campaigns/${campaignId}`);
    await expect(page.getByRole('heading', { name: campaignName })).toBeVisible();
    await page.getByRole('button', { name: /^roster$/i }).click();
    await expect(page.getByRole('heading', { name: /party roster/i })).toBeVisible();

    // The member appears with a Remove control; the owner's own row has none.
    await expect(page.getByText('Booted Bran')).toBeVisible();
    await page.getByRole('button', { name: /remove player booted bran/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(/remove player/i);
    await expect(dialog).toContainText(/detached/i);
    await dialog.getByRole('button', { name: 'Remove', exact: true }).click();

    // The member drops off the list and the success toast fires.
    await expect(page.getByText(/player removed from campaign/i)).toBeVisible();
    await expect(page.getByText('Booted Bran')).toHaveCount(0);

    // The character survived but was detached from the campaign.
    const afterRes = await playerPage.request.get(`${BACKEND}/api/characters/${characterId}`, {
      headers: playerHeaders,
    });
    expect(afterRes.ok(), `character fetch failed: ${afterRes.status()}`).toBeTruthy();
    expect((await afterRes.json()).campaignId).toBeNull();

    await playerCtx.close();
  });
});
