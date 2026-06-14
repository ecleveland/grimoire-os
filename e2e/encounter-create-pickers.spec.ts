import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

test.describe('Party + monster pickers on the encounter create flow (VEG-358)', () => {
  test('DM builds an encounter with a party PC, a monster, and a manual row in one step', async ({
    page,
  }) => {
    await registerAndLogin(page, 'create-pickers', 'E2E Create-Pickers DM');
    const headers = await csrfHeaders(page);

    // Campaign + an attached PC, so the party picker has someone to offer.
    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Pickers ${Date.now()}` },
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

    await page.getByLabel(/encounter name/i).fill('Ambush at the bridge');

    // Manual row: a hand-keyed bandit.
    const manualCard = page.locator('div.p-4', { hasText: 'Combatant 1' });
    await manualCard.getByRole('textbox').fill('Bandit');

    // Party picker → add Thia.
    await page.getByRole('button', { name: /add party/i }).click();
    const partyDialog = page.getByRole('dialog', { name: /add party/i });
    await expect(partyDialog.getByText('Thia')).toBeVisible();
    await partyDialog.getByRole('button', { name: /add selected/i }).click();
    await expect(partyDialog).toBeHidden();
    await expect(page.getByRole('button', { name: /remove thia/i })).toBeVisible();

    // Monster picker → search, open the stat block, add to the encounter.
    await page.getByPlaceholder(/search monsters/i).fill('goblin');
    const result = page.getByTestId('lookup-result').first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();
    const monsterDialog = page.getByRole('dialog');
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();
    const monsterName = ((await monsterDialog.locator('h3').first().textContent()) ?? '').trim();
    expect(monsterName.length).toBeGreaterThan(0);
    await monsterDialog.getByRole('button', { name: /add to encounter/i }).click();
    await expect(monsterDialog.getByLabel('Quantity')).toBeVisible();
    await monsterDialog.getByRole('button', { name: /add to encounter/i }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: new RegExp(`remove ${monsterName}`, 'i') })).toBeVisible();

    // Create the encounter in one POST and land on the tracker with everyone.
    await page.getByRole('button', { name: /create encounter/i }).click();
    await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/encounters/[^/]+$`));
    await expect(page.getByRole('heading', { name: /ambush at the bridge/i })).toBeVisible();

    await expect(page.getByText('Bandit', { exact: true })).toBeVisible();
    await expect(page.getByText('Thia', { exact: true })).toBeVisible();
    // The monster joined as a stat-block-linked combatant (its name is a button).
    await expect(page.getByRole('button', { name: monsterName, exact: true }).first()).toBeVisible();
  });
});
