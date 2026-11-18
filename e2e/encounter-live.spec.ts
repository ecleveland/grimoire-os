import { expect, test } from '@playwright/test';
import { BACKEND, createEncounter, csrfHeaders, registerAndLogin } from './helpers';

// A campaign member watching the tracker follows the DM starting combat,
// advancing turns and ending combat, all without reloading.
test.describe('Encounter tracker refreshes for campaign members (VEG-683)', () => {
  test('a member who opens the tracker before combat follows the DM without reloading', async ({
    page,
    browser,
  }) => {
    // The player waits out up to one idle poll before combat starts and one
    // live poll per later step, so the default 30 s budget is too tight.
    test.slow();

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

      // The player opens the tracker before combat starts. It is read-only and
      // already live, so it can notice the DM starting combat.
      await playerPage.goto(trackerUrl);
      await expect(playerPage.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
      await expect(playerPage.getByText('Inactive', { exact: true })).toBeVisible();
      await expect(playerPage.getByTestId('live-indicator')).toBeVisible();
      await expect(playerPage.getByTestId('live-indicator')).toHaveText(/live/i);
      await expect(playerPage.getByRole('button', { name: /next turn/i })).toHaveCount(0);

      // The DM starts combat, and the player's tracker follows with no reload.
      await page.goto(trackerUrl);
      await page.getByRole('button', { name: /start combat/i }).click();
      await expect(page.getByText('Active', { exact: true })).toBeVisible();
      await expect(playerPage.getByText('Active', { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(playerPage.getByText(/round 1/i)).toBeVisible();

      // The DM adds a monster from the lookup panel. The first 'goblin' match
      // is whatever the seeded compendium ranks first, so read its name.
      await page.getByPlaceholder(/search monsters/i).fill('goblin');
      const result = page.getByTestId('lookup-result').first();
      await expect(result).toBeVisible({ timeout: 10_000 });
      await result.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(page.getByTestId('monster-stat-block')).toBeVisible();
      const monsterName = ((await dialog.locator('h3').first().textContent()) ?? '').trim();
      expect(monsterName.length).toBeGreaterThan(0);
      await dialog.getByRole('button', { name: /add to encounter/i }).click();
      await expect(dialog.getByLabel('Quantity')).toBeVisible();
      await dialog.getByRole('button', { name: /add to encounter/i }).click();
      await expect(page.getByRole('dialog')).toBeHidden();
      await expect(
        page.getByRole('button', { name: monsterName, exact: true }).first()
      ).toBeVisible();

      // The player pins the monster's stat block while it is still Hero's turn.
      const pinned = playerPage.getByRole('button', { name: monsterName, exact: true }).first();
      await expect(pinned).toBeVisible({ timeout: 10_000 });
      await pinned.click();
      const playerPanel = playerPage.getByTestId('active-stat-panel');
      const pinnedHeading = playerPanel.getByRole('heading', { name: monsterName, exact: true });
      await expect(pinnedHeading).toBeVisible();

      // The monster rolls initiative 10 by default, below Hero's 18, so the
      // first next turn moves to the monster.
      const escapedName = monsterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const monsterTurn = new RegExp(`${escapedName}'s turn`, 'i');
      await page.getByRole('button', { name: /next turn/i }).click();
      await expect(page.getByText(monsterTurn)).toBeVisible();
      await expect(playerPage.getByText(monsterTurn).first()).toBeVisible({ timeout: 10_000 });
      await expect(pinnedHeading).toBeVisible();

      // The second next turn wraps to round 2 with Hero up again. The player's
      // pin survives both polled turn changes, so the panel still shows the
      // monster and the quick-reference banner says whose turn it is.
      await page.getByRole('button', { name: /next turn/i }).click();
      await expect(page.getByText(/round 2/i)).toBeVisible();
      await expect(playerPage.getByText(/round 2/i)).toBeVisible({ timeout: 10_000 });
      await expect(pinnedHeading).toBeVisible();
      await expect(playerPanel.getByText(/quick reference/i)).toBeVisible();
      await expect(playerPanel.getByText(/still hero's turn/i)).toBeVisible();

      // Back to current turn drops the pin and the panel follows Hero again.
      await playerPanel.getByRole('button', { name: /back to current turn/i }).click();
      await expect(pinnedHeading).toBeHidden();

      // Ending combat reaches the player too, and the tracker stays live.
      await page.getByRole('button', { name: /end combat/i }).click();
      await expect(playerPage.getByText('Inactive', { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(playerPage.getByTestId('live-indicator')).toBeVisible();
    } finally {
      await playerCtx.close();
    }
  });
});
