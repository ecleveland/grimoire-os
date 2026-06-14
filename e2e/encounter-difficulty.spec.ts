import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

test.describe('Encounter difficulty readout (VEG-362)', () => {
  test('shows monster XP/CR and a 2024 difficulty band on the create page and tracker', async ({
    page,
  }) => {
    await registerAndLogin(page, 'difficulty', 'E2E Difficulty DM');
    const headers = await csrfHeaders(page);

    // Campaign + an attached level-5 PC so the party budget can rate difficulty.
    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Difficulty ${Date.now()}` },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

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

    await page.goto(`/campaigns/${campaignId}/encounters/new`);
    await expect(page.getByRole('heading', { name: /create encounter/i })).toBeVisible();
    await page.getByLabel(/encounter name/i).fill('Difficulty check');

    const readout = page.getByTestId('encounter-difficulty');
    await expect(readout).toContainText(/no monsters yet/i);

    // Add the party (supplies the PC level → budget).
    await page.getByRole('button', { name: /add party/i }).click();
    const partyDialog = page.getByRole('dialog', { name: /add party/i });
    await expect(partyDialog.getByText('Thia')).toBeVisible();
    await partyDialog.getByRole('button', { name: /add selected/i }).click();
    await expect(partyDialog).toBeHidden();

    // Add a monster (supplies CR/XP).
    await page.getByPlaceholder(/search monsters/i).fill('goblin');
    const result = page.getByTestId('lookup-result').first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();
    const monsterDialog = page.getByRole('dialog');
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();
    const monsterName = ((await monsterDialog.locator('h3').first().textContent()) ?? '').trim();
    await monsterDialog.getByRole('button', { name: /add to encounter/i }).click();
    await expect(monsterDialog.getByLabel('Quantity')).toBeVisible();
    // Three of them vs the single PC → also trips the action-economy warning.
    await monsterDialog.getByLabel('Quantity').fill('3');
    await monsterDialog.getByRole('button', { name: /add to encounter/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // The create-page readout now reflects the monsters + a rated band, and
    // flags the 3-vs-1 action economy the XP band alone would miss.
    await expect(readout).toContainText(/3 monsters/);
    await expect(readout).toContainText(/XP/);
    await expect(readout.getByTestId('difficulty-band')).toBeVisible();
    await expect(readout.getByTestId('action-economy-warning')).toBeVisible();

    await page.getByRole('button', { name: /create encounter/i }).click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/encounters/[^/]+$`));
    await expect(page.getByRole('heading', { name: /difficulty check/i })).toBeVisible();

    // The tracker shows the same readout, computed from the persisted snapshots.
    const trackerReadout = page.getByTestId('encounter-difficulty');
    await expect(trackerReadout).toContainText(/3 monsters/);
    await expect(trackerReadout).toContainText(/XP/);
    await expect(trackerReadout.getByTestId('difficulty-band')).toBeVisible();
    await expect(trackerReadout.getByTestId('action-economy-warning')).toBeVisible();
    // Sanity: the monster joined as a stat-block-linked combatant.
    await expect(
      page.getByRole('button', { name: monsterName, exact: true }).first()
    ).toBeVisible();
  });
});
