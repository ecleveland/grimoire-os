import { expect, test, type Page } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// VEG-299: inline one-click loot reroll on the NPC detail view + bulk reroll
// from the NPC list.

async function setupCampaignWithNpc(page: Page): Promise<{ campaignId: string; npcUrl: string }> {
  await registerAndLogin(page, 'loot-dm');
  const headers = await csrfHeaders(page);

  const camp = await page.request.post(`${BACKEND}/api/campaigns`, {
    data: { name: `Loot Reroll ${Date.now()}`, status: 'active' },
    headers,
  });
  expect(camp.ok(), `campaign create failed: ${camp.status()}`).toBeTruthy();
  const { id: campaignId } = await camp.json();

  // Generate + save an NPC through the UI so it carries generationParams
  // (manual NPCs cannot be rerolled).
  await page.goto(`/campaigns/${campaignId}/npcs/new`);
  await page.getByRole('button', { name: /generate preview/i }).click();
  const saveButton = page.getByRole('button', { name: /^save$/i });
  await expect(saveButton).toBeVisible({ timeout: 10_000 });
  await saveButton.click();
  await page.waitForURL(new RegExp(`/campaigns/${campaignId}/npcs/[a-f0-9-]+$`), {
    timeout: 10_000,
  });

  return { campaignId, npcUrl: page.url() };
}

test.describe('NPC loot reroll', () => {
  test('DM rerolls loot inline from the NPC detail page', async ({ page }) => {
    await setupCampaignWithNpc(page);

    const rerollLoot = page.getByRole('button', { name: /^reroll loot$/i });
    await expect(rerollLoot).toBeVisible();
    await rerollLoot.click();

    // Success toast from the in-place update; no navigation to the edit page.
    await expect(page.getByText(/re-rolled loot/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/npcs\/[a-f0-9-]+$/);
  });

  test('DM bulk-rerolls loot from the NPC list', async ({ page }) => {
    const { campaignId } = await setupCampaignWithNpc(page);

    await page.goto(`/campaigns/${campaignId}/npcs`);
    await page
      .getByRole('checkbox', { name: /^select /i })
      .first()
      .check();
    await page.getByRole('button', { name: /reroll loot \(1\)/i }).click();

    await expect(page.getByText(/rerolled loot for 1 npc/i)).toBeVisible({ timeout: 10_000 });
  });
});
