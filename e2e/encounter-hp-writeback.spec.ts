import { expect, test } from '@playwright/test';
import { BACKEND, createEncounter, csrfHeaders, registerAndLogin } from './helpers';

// Damage the DM applies in the tracker lands on the linked character, and the
// player's open sheet picks it up when the tab regains focus.
test.describe('Encounter combat writes HP back to the linked character (VEG-693)', () => {
  test('the player sheet shows tracker damage after a focus refetch', async ({ page, browser }) => {
    // Two browser contexts, a party add and a cross-user write: give it room.
    test.slow();

    // The DM creates the fixture encounter and mints an invite code.
    await registerAndLogin(page, 'hpwbdm', 'E2E Writeback DM');
    const { campaignId, encounterId } = await createEncounter(page, 'Writeback Camp');
    const inviteRes = await page.request.post(
      `${BACKEND}/api/campaigns/${campaignId}/invite-code`,
      { headers: await csrfHeaders(page) }
    );
    expect(inviteRes.ok(), `invite code failed: ${inviteRes.status()}`).toBeTruthy();
    const inviteCode = (await inviteRes.json()).inviteCode as string;

    const playerCtx = await browser.newContext();
    try {
      // A player joins, creates a 20 HP character and attaches it to the campaign.
      const playerPage = await playerCtx.newPage();
      await registerAndLogin(playerPage, 'hpwbplayer', 'E2E Writeback Player');
      const playerHeaders = await csrfHeaders(playerPage);
      const joinRes = await playerPage.request.post(`${BACKEND}/api/campaigns/join/${inviteCode}`, {
        headers: playerHeaders,
      });
      expect(joinRes.ok(), `join failed: ${joinRes.status()}`).toBeTruthy();

      const name = `Kestrel ${Date.now()}`;
      const charRes = await playerPage.request.post(`${BACKEND}/api/characters`, {
        data: {
          name,
          abilityScores: {
            strength: 10,
            dexterity: 10,
            constitution: 10,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
          },
          hitPoints: { max: 20, current: 20, temporary: 0 },
          armorClass: 12,
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

      // The player opens the sheet at full HP before combat touches it.
      await playerPage.goto(`/characters/${characterId}`);
      await expect(playerPage.getByRole('heading', { name })).toBeVisible();
      const playerHp = playerPage.getByTestId('hp-block');
      await expect(playerHp.getByText('20/20')).toBeVisible();

      // The DM adds the party through the tracker's picker.
      await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
      await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
      await page.getByRole('button', { name: /add party/i }).click();
      const dialog = page.getByRole('dialog', { name: /add party/i });
      await expect(dialog.getByRole('checkbox', { name: `Add ${name}` })).toBeChecked();
      await dialog.getByRole('spinbutton', { name: `Initiative for ${name}` }).fill('12');
      await dialog.getByRole('button', { name: /add selected/i }).click();
      await expect(page.getByText(`Added ${name} to the encounter`)).toBeVisible();
      await expect(dialog).not.toBeVisible();

      // The DM deals 7 damage: 20 to 13.
      const trackerHp = page.getByRole('spinbutton', { name: `HP for ${name}` });
      await expect(trackerHp).toHaveValue('20');
      await page.getByRole('textbox', { name: `Damage or heal amount for ${name}` }).fill('7');
      await page.getByRole('button', { name: `Damage ${name}`, exact: true }).click();
      await expect(trackerHp).toHaveValue('13');

      // The save reached the character before the player's tab refocuses, so
      // the focus refetch reads the new HP rather than racing the write.
      await expect
        .poll(
          async () => {
            const res = await playerPage.request.get(`${BACKEND}/api/characters/${characterId}`);
            expect(res.ok(), `character read failed: ${res.status()}`).toBeTruthy();
            return (await res.json()).hitPoints.current as number;
          },
          { timeout: 15_000 }
        )
        .toBe(13);

      // Nothing has refetched the sheet yet.
      await expect(playerHp.getByText('20/20')).toBeVisible();

      // TanStack's focus manager listens for visibilitychange on window, and
      // headless Chromium never fires it on its own.
      await playerPage.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
      await expect(playerHp.getByText('13/20')).toBeVisible();
    } finally {
      await playerCtx.close();
    }
  });
});
