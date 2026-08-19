import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

const SCORES = (dexterity: number) => ({
  strength: 10,
  dexterity,
  constitution: 10,
  intelligence: 10,
  wisdom: 10,
  charisma: 10,
});

/**
 * VEG-452. The sheet and the encounter roster used to read initiative from two
 * different places: StatsBar showed the computed Dex modifier while the party-add
 * dialog rolled off the stored column, which is null for any character nobody has
 * hand-edited. So a Dex 18 PC read +4 on their own sheet and was added to combat
 * at d20+0. These specs pin the two readouts to one number.
 */
test.describe('character sheet — initiative (VEG-452)', () => {
  test('quotes one modifier on the sheet and in the encounter party-add', async ({ page }) => {
    await registerAndLogin(page, 'initrec', 'E2E Initiative DM');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Init Camp ${Date.now()}` },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    // Dex 18 → +4, and NO stored initiative — the exact shape that used to
    // reach the tracker as +0.
    const charRes = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Quick Quinn',
        campaignId,
        abilityScores: SCORES(18),
        hitPoints: { max: 20, current: 20, temporary: 0 },
      },
      headers,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();
    const characterId = (await charRes.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Quick Quinn' })).toBeVisible();
    await expect(page.getByTestId('stat-initiative')).toContainText('+4');
    // No bonus stored, so nothing to break down.
    await expect(page.getByTestId('initiative-breakdown')).toBeHidden();

    const encRes = await page.request.post(`${BACKEND}/api/encounters`, {
      data: { campaignId, name: 'Init Check', combatants: [] },
      headers,
    });
    expect(encRes.ok(), `encounter create failed: ${encRes.status()}`).toBeTruthy();
    const encounterId = (await encRes.json()).id as string;

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await page.getByRole('button', { name: /add party/i }).click();
    await expect(page.getByTestId('add-party')).toBeVisible();

    // The roll button's tooltip names the modifier the roster resolved. Before
    // this ticket it read "d20 +0" for this character.
    await expect(
      page.getByRole('button', { name: 'Roll initiative for Quick Quinn' })
    ).toHaveAttribute('title', 'd20 +4');
  });

  test('adds a stored bonus on top of Dexterity in both readouts', async ({ page }) => {
    await registerAndLogin(page, 'initbonus', 'E2E Initiative Bonus DM');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Bonus Camp ${Date.now()}` },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    // Dex 14 → +2, plus an Alert-style stored bonus of +5 → +7.
    const charRes = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Alert Alia',
        campaignId,
        abilityScores: SCORES(14),
        initiative: 5,
        hitPoints: { max: 20, current: 20, temporary: 0 },
      },
      headers,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();
    const characterId = (await charRes.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Alert Alia' })).toBeVisible();
    await expect(page.getByTestId('stat-initiative')).toContainText('+7');
    const breakdown = page.getByTestId('initiative-breakdown');
    await expect(breakdown).toContainText('+2 dex');
    await expect(breakdown).toContainText('+5 bonus');

    const encRes = await page.request.post(`${BACKEND}/api/encounters`, {
      data: { campaignId, name: 'Bonus Check', combatants: [] },
      headers,
    });
    expect(encRes.ok(), `encounter create failed: ${encRes.status()}`).toBeTruthy();
    const encounterId = (await encRes.json()).id as string;

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await page.getByRole('button', { name: /add party/i }).click();
    await expect(page.getByTestId('add-party')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Roll initiative for Alert Alia' })
    ).toHaveAttribute('title', 'd20 +7');
  });
});
