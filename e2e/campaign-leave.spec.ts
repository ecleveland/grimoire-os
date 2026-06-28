import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// VEG-359: a non-owner member leaves a campaign via the detail-page control. The
// owner sets up the campaign + invite code; a second user joins, attaches a
// character, then self-leaves — which detaches their character and drops the
// campaign from their list.
test.describe('Leave a campaign (player self-service, VEG-359)', () => {
  test('a member leaves: character is detached and the campaign leaves their list', async ({
    page,
    browser,
  }) => {
    // DM creates a campaign and mints an invite code.
    await registerAndLogin(page, 'leavedm', 'E2E Leave DM');
    const dmHeaders = await csrfHeaders(page);
    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Leave Target ${Date.now()}` },
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
    await registerAndLogin(playerPage, 'leaveplayer', 'E2E Leave Player');
    const playerHeaders = await csrfHeaders(playerPage);

    const joinRes = await playerPage.request.post(
      `${BACKEND}/api/campaigns/join/${inviteCode}`,
      { headers: playerHeaders }
    );
    expect(joinRes.ok(), `join failed: ${joinRes.status()}`).toBeTruthy();

    const charRes = await playerPage.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Vimak Leaver',
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

    // The player leaves via the campaign detail page.
    await playerPage.goto(`/campaigns/${campaignId}`);
    await expect(playerPage.getByRole('heading', { name: campaignName })).toBeVisible();
    await playerPage.getByRole('button', { name: /leave campaign/i }).click();
    const dialog = playerPage.getByRole('dialog');
    await expect(dialog).toContainText(/leave campaign/i);
    await dialog.getByRole('button', { name: 'Leave', exact: true }).click();

    // Routed back to the list, and the campaign is gone from it.
    await expect(playerPage).toHaveURL(/\/campaigns$/);
    await expect(playerPage.getByText(campaignName)).toHaveCount(0);

    // The character survived but was detached from the campaign.
    const afterRes = await playerPage.request.get(`${BACKEND}/api/characters/${characterId}`, {
      headers: playerHeaders,
    });
    expect(afterRes.ok(), `character fetch failed: ${afterRes.status()}`).toBeTruthy();
    expect((await afterRes.json()).campaignId).toBeNull();

    await playerCtx.close();
  });
});
