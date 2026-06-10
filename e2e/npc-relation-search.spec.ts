import { expect, test, type Page } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// Seed a campaign with MORE NPCs than the relation search's page size (10) so
// this spec fails if the search ever regresses to client-side filtering of
// page 1 (VEG-313).
async function seedCampaignWithNpcs(
  page: Page
): Promise<{ campaignId: string; anchorNpcId: string }> {
  const headers = await csrfHeaders(page);

  const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
    data: { name: `Relations Camp ${Date.now()}` },
    headers,
  });
  expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
  const campaignId = (await campRes.json()).id as string;

  const mkNpc = async (name: string) => {
    const res = await page.request.post(`${BACKEND}/api/npcs`, {
      data: { campaignId, name, race: 'Human' },
      headers,
    });
    expect(res.ok(), `npc create failed for ${name}: ${res.status()}`).toBeTruthy();
    return (await res.json()).id as string;
  };

  const anchorNpcId = await mkNpc('Anchor Aldric');
  // 11 fillers updated most recently → they fill page 1 ahead of the target.
  for (let i = 1; i <= 11; i++) await mkNpc(`Filler Townsfolk ${i}`);
  await mkNpc('Zephyrine the Hidden'); // the NPC the old code could never find

  return { campaignId, anchorNpcId };
}

test.describe('NPC relation search reaches beyond the first page (VEG-313)', () => {
  test('DM links an NPC that is not in the first 10 results', async ({ page }) => {
    await registerAndLogin(page, 'rel', 'E2E Relations DM');
    const { campaignId, anchorNpcId } = await seedCampaignWithNpcs(page);

    await page.goto(`/campaigns/${campaignId}/npcs/${anchorNpcId}`);
    await expect(page.getByRole('heading', { name: /anchor aldric/i })).toBeVisible();

    await page.getByRole('button', { name: /add existing npc/i }).click();
    await page.getByLabel(/relation type/i).selectOption('ally');
    await page.getByPlaceholder(/search npcs/i).fill('zephyrine');

    // The match comes back from the server-side search, beyond page 1.
    const result = page.getByRole('button', { name: /zephyrine the hidden/i });
    await expect(result).toBeVisible();
    await result.click();

    // The relation is linked and rendered in the list.
    await expect(page.getByText(/ally/i).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /zephyrine the hidden/i })).toBeVisible();
  });
});
