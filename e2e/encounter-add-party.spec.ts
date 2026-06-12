import { expect, test } from '@playwright/test';
import { BACKEND, createEncounter, csrfHeaders, registerAndLogin } from './helpers';

test.describe('Add party PCs to an encounter (VEG-283)', () => {
  test('DM pulls a campaign character into the encounter with a sheet snapshot', async ({
    page,
  }) => {
    await registerAndLogin(page, 'party', 'E2E Party DM');
    const { campaignId, encounterId } = await createEncounter(page, 'Party Camp');
    const headers = await csrfHeaders(page);

    // Create a PC and attach it to the campaign via the API.
    const charRes = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Thia',
        race: 'Elf',
        class: 'Wizard',
        level: 5,
        armorClass: 12,
        initiative: 2,
        hitPoints: { max: 22, current: 17, temporary: 0 },
      },
      headers,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();
    const characterId = (await charRes.json()).id as string;
    const attachRes = await page.request.post(
      `${BACKEND}/api/campaigns/${campaignId}/characters/${characterId}`,
      { headers }
    );
    expect(attachRes.ok(), `attach failed: ${attachRes.status()}`).toBeTruthy();

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // Open the party picker: the roster row shows the sheet snapshot.
    await page.getByRole('button', { name: /add party/i }).click();
    const dialog = page.getByRole('dialog', { name: /add party/i });
    await expect(dialog.getByText('Thia')).toBeVisible();
    await expect(dialog.getByText(/AC 12 · HP 17\/22/)).toBeVisible();

    // Set initiative and add.
    const init = dialog.getByRole('spinbutton', { name: /initiative for thia/i });
    await init.fill('14');
    await dialog.getByRole('button', { name: /add selected/i }).click();

    await expect(page.getByText(/added thia to the encounter/i)).toBeVisible();
    await expect(dialog).not.toBeVisible();

    // The PC renders as a plain (non-monster) row and survives a reload.
    await expect(page.getByText('Thia', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Thia', { exact: true })).toBeVisible();
  });
});
