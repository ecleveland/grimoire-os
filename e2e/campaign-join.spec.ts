import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

test.describe('Join a campaign via invite code (VEG-343)', () => {
  test('a second user redeems an invite code and lands on the campaign', async ({
    page,
    browser,
  }) => {
    // DM registers, creates a campaign, and mints an invite code.
    await registerAndLogin(page, 'joindm', 'E2E Join DM');
    const dmHeaders = await csrfHeaders(page);
    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Join Target ${Date.now()}` },
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

    // A second user joins through the redemption UI.
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await registerAndLogin(playerPage, 'joinplayer', 'E2E Join Player');

    await playerPage.goto('/campaigns');
    await playerPage.getByRole('link', { name: /join campaign/i }).click();
    await expect(playerPage.getByRole('heading', { name: /join a campaign/i })).toBeVisible();

    await playerPage.getByLabel(/invite code/i).fill(inviteCode);
    await playerPage.getByRole('button', { name: /join campaign/i }).click();

    // Lands on the joined campaign's detail page.
    await expect(playerPage).toHaveURL(new RegExp(`/campaigns/${campaignId}$`));

    // And it now shows in the player's campaigns list.
    await playerPage.goto('/campaigns');
    await expect(playerPage.getByText(campaignName)).toBeVisible();

    await playerCtx.close();
  });

  test('an invalid code shows an error and does not navigate', async ({ page }) => {
    await registerAndLogin(page, 'joinbad', 'E2E Join Bad');
    await page.goto('/campaigns/join');

    await page.getByLabel(/invite code/i).fill('not-a-real-code');
    await page.getByRole('button', { name: /join campaign/i }).click();

    await expect(page.getByText(/invalid invite code/i)).toBeVisible();
    await expect(page).toHaveURL(/\/campaigns\/join$/);
  });
});
