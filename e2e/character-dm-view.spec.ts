import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// The DM opens a player's character from the campaign roster and reads it
// without edit controls. The player opening the same sheet still owns it.
test.describe('DM reads a player character from the roster', () => {
  test('the DM sees a read-only sheet and the player still sees an editable one', async ({
    page,
    browser,
  }) => {
    // The DM creates a campaign and mints an invite code.
    await registerAndLogin(page, 'dmview', 'E2E View DM');
    const dmHeaders = await csrfHeaders(page);
    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `DM View ${Date.now()}` },
      headers: dmHeaders,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    const inviteRes = await page.request.post(
      `${BACKEND}/api/campaigns/${campaignId}/invite-code`,
      { headers: dmHeaders }
    );
    expect(inviteRes.ok(), `invite code failed: ${inviteRes.status()}`).toBeTruthy();
    const inviteCode = (await inviteRes.json()).inviteCode as string;

    // A player joins, creates a character and attaches it to the campaign.
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await registerAndLogin(playerPage, 'dmviewplayer', 'E2E View Player');
    const playerHeaders = await csrfHeaders(playerPage);

    const joinRes = await playerPage.request.post(`${BACKEND}/api/campaigns/join/${inviteCode}`, {
      headers: playerHeaders,
    });
    expect(joinRes.ok(), `join failed: ${joinRes.status()}`).toBeTruthy();

    // Mirror the create form's payload so the sheet has the embedded data it renders.
    const charRes = await playerPage.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Mialee Watched',
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        hitPoints: { max: 10, current: 10, temporary: 0 },
        armorClass: 10,
        speed: 30,
      },
      headers: playerHeaders,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();
    const characterId = (await charRes.json()).id as string;

    const attachRes = await playerPage.request.post(
      `${BACKEND}/api/campaigns/${campaignId}/characters/${characterId}`,
      { headers: playerHeaders }
    );
    expect(attachRes.ok(), `attach failed: ${attachRes.status()}`).toBeTruthy();

    // The DM follows the roster link to the player's sheet.
    await page.goto(`/campaigns/${campaignId}`);
    await page.getByRole('button', { name: /^roster$/i }).click();
    await page.getByRole('link', { name: /mialee watched/i }).click();

    await expect(page).toHaveURL(new RegExp(`/characters/${characterId}$`));
    await expect(page.getByRole('heading', { name: 'Mialee Watched' })).toBeVisible();
    await expect(page.getByTestId('owner-banner')).toContainText('E2E View Player');
    await expect(page.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /save snapshot/i })).toHaveCount(0);

    // The player opening the same sheet gets no banner and the Edit link.
    await playerPage.goto(`/characters/${characterId}`);
    await expect(playerPage.getByRole('heading', { name: 'Mialee Watched' })).toBeVisible();
    await expect(playerPage.getByRole('link', { name: 'Edit', exact: true })).toBeVisible();
    await expect(playerPage.getByTestId('owner-banner')).toHaveCount(0);

    await playerCtx.close();
  });
});
