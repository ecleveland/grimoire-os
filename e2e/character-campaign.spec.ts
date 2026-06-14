import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// A campaign owner is a member of their own campaign, so a single user can both
// create-with-campaign and attach an existing character (VEG-344, slice 2).
test.describe('Attach a character to a campaign (VEG-344)', () => {
  test('create-time picker pre-attaches a new character to a campaign', async ({ page }) => {
    await registerAndLogin(page, 'attachnew', 'E2E Attach DM');
    const headers = await csrfHeaders(page);
    const campaignName = `Create-Attach ${Date.now()}`;
    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: campaignName },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();

    await page.goto('/characters/new');
    await page.getByLabel(/name/i).first().fill('Mialee Pre-Attached');
    await page.getByLabel('Campaign').selectOption({ label: campaignName });
    await page.getByRole('button', { name: /create character/i }).click();

    // Lands on the new character's sheet, which shows the attached campaign.
    await expect(page).toHaveURL(/\/characters\/[^/]+$/);
    await expect(page.getByRole('link', { name: campaignName })).toBeVisible();
  });

  test('attach button adds an existing unattached character to a campaign', async ({ page }) => {
    await registerAndLogin(page, 'attachexisting', 'E2E Attach DM2');
    const headers = await csrfHeaders(page);
    const campaignName = `Attach-Existing ${Date.now()}`;
    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: campaignName },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();

    // Mirror the create form's payload so the sheet has the embedded data it
    // renders (hitPoints, ability scores); a bare {name} is not a UI-reachable shape.
    const charRes = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Tordek Unattached',
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
      headers,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();
    const characterId = (await charRes.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await page.getByLabel('Add to campaign').selectOption({ label: campaignName });
    await page.getByRole('button', { name: 'Add to campaign' }).click();

    await expect(page.getByText(/added to campaign/i)).toBeVisible();
    await expect(page.getByRole('link', { name: campaignName })).toBeVisible();
  });
});
