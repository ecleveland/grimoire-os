import { expect, test } from '@playwright/test';
import { BACKEND, createEncounter, csrfHeaders, registerAndLogin } from './helpers';

// A campaign member watching the tracker follows the DM's turns without
// reloading, and the live indicator goes away when combat ends.
test.describe('Encounter tracker refreshes for campaign members (VEG-683)', () => {
  test('a member sees the DM advance the round while combat is active', async ({
    page,
    browser,
  }) => {
    // The DM creates the fixture encounter and mints an invite code.
    await registerAndLogin(page, 'livedm', 'E2E Live DM');
    const { campaignId, encounterId } = await createEncounter(page, 'Live Camp');
    const inviteRes = await page.request.post(
      `${BACKEND}/api/campaigns/${campaignId}/invite-code`,
      { headers: await csrfHeaders(page) }
    );
    expect(inviteRes.ok(), `invite code failed: ${inviteRes.status()}`).toBeTruthy();
    const inviteCode = (await inviteRes.json()).inviteCode as string;

    const playerCtx = await browser.newContext();
    try {
      const playerPage = await playerCtx.newPage();
      await registerAndLogin(playerPage, 'liveplayer', 'E2E Live Player');
      const joinRes = await playerPage.request.post(`${BACKEND}/api/campaigns/join/${inviteCode}`, {
        headers: await csrfHeaders(playerPage),
      });
      expect(joinRes.ok(), `join failed: ${joinRes.status()}`).toBeTruthy();

      const trackerUrl = `/campaigns/${campaignId}/encounters/${encounterId}`;

      // The DM starts combat.
      await page.goto(trackerUrl);
      await page.getByRole('button', { name: /start combat/i }).click();
      await expect(page.getByText('Active', { exact: true })).toBeVisible();

      // The player opens the tracker read-only and sees it is live.
      await playerPage.goto(trackerUrl);
      await expect(playerPage.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
      await expect(playerPage.getByTestId('live-indicator')).toBeVisible();
      await expect(playerPage.getByTestId('live-indicator')).toHaveText(/live/i);
      await expect(playerPage.getByRole('button', { name: /next turn/i })).toHaveCount(0);
      await expect(playerPage.getByText(/round 1/i)).toBeVisible();

      // One combatant, so the next turn wraps to round 2.
      await page.getByRole('button', { name: /next turn/i }).click();
      await expect(page.getByText(/round 2/i)).toBeVisible();

      // The player's tracker picks the change up with no reload.
      await expect(playerPage.getByText(/round 2/i)).toBeVisible({ timeout: 10_000 });

      // Ending combat stops the live view, and the tracker stays on screen.
      await page.getByRole('button', { name: /end combat/i }).click();
      await expect(playerPage.getByTestId('live-indicator')).toHaveCount(0, { timeout: 10_000 });
      await expect(playerPage.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    } finally {
      await playerCtx.close();
    }
  });
});
