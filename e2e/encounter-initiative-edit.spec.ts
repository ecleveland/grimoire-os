import { expect, test, type Page } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// Hero holds the turn (index 0); the two goblins tie at 12 so the manual
// reorder controls render.
async function createTieEncounter(
  page: Page,
  campaignPrefix: string
): Promise<{ campaignId: string; encounterId: string }> {
  const headers = await csrfHeaders(page);

  const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
    data: { name: `${campaignPrefix} ${Date.now()}` },
    headers,
  });
  expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
  const campaignId = (await campRes.json()).id as string;

  const encRes = await page.request.post(`${BACKEND}/api/encounters`, {
    data: {
      campaignId,
      name: 'Goblin Ambush',
      combatants: [
        { name: 'Hero', initiative: 18, hp: 24, maxHp: 24, ac: 16, isNpc: false },
        { name: 'Goblin A', initiative: 12, hp: 7, maxHp: 7, ac: 13, isNpc: true },
        { name: 'Goblin B', initiative: 12, hp: 7, maxHp: 7, ac: 13, isNpc: true },
      ],
    },
    headers,
  });
  expect(encRes.ok(), `encounter create failed: ${encRes.status()}`).toBeTruthy();
  const encounterId = (await encRes.json()).id as string;

  return { campaignId, encounterId };
}

// The initiative inputs render once per combatant row, in sorted order — their
// aria-labels read back the top-down combatant order.
function initiativeOrder(page: Page): Promise<(string | null)[]> {
  return page
    .locator('input[aria-label^="Initiative for"]')
    .evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
}

test.describe('Inline initiative edit + tie reorder (VEG-285)', () => {
  test('editing initiative re-sorts the tracker, moves the turn pointer with the active combatant, and persists', async ({
    page,
  }) => {
    await registerAndLogin(page, 'inied', 'E2E InitEdit DM');
    const { campaignId, encounterId } = await createTieEncounter(page, 'InitEdit Camp');

    const patches: string[] = [];
    page.on('request', req => {
      if (req.method() === 'PATCH' && req.url().includes(`/encounters/${encounterId}`)) {
        patches.push(req.postData() ?? '');
      }
    });

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect
      .poll(() => initiativeOrder(page))
      .toEqual(['Initiative for Hero', 'Initiative for Goblin A', 'Initiative for Goblin B']);

    // Type the new value keystroke-by-keystroke — no PATCH may fire while typing.
    const init = page.getByRole('textbox', { name: 'Initiative for Goblin B' });
    await init.click();
    await init.clear();
    await init.pressSequentially('20');
    expect(patches).toHaveLength(0);

    // Enter commits exactly one version-guarded PATCH carrying the re-sorted
    // list and the identity-tracked turn pointer (Hero: sorted 0 → 1).
    await init.press('Enter');
    await expect.poll(() => patches.length).toBe(1);
    const body = JSON.parse(patches[0]);
    expect(body.expectedVersion).toBeDefined();
    expect(body.combatants.map((c: { name: string }) => c.name)).toEqual([
      'Goblin B',
      'Hero',
      'Goblin A',
    ]);
    expect(body.currentTurn).toBe(1);

    // The tracker re-sorted on screen.
    await expect
      .poll(() => initiativeOrder(page))
      .toEqual(['Initiative for Goblin B', 'Initiative for Hero', 'Initiative for Goblin A']);

    // Durable, not client-side only: order and value survive a reload.
    await page.reload();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect
      .poll(() => initiativeOrder(page))
      .toEqual(['Initiative for Goblin B', 'Initiative for Hero', 'Initiative for Goblin A']);
    await expect(page.getByRole('textbox', { name: 'Initiative for Goblin B' })).toHaveValue('20');
  });

  test('tied combatants can be reordered manually and the order persists', async ({ page }) => {
    await registerAndLogin(page, 'inire', 'E2E InitReorder DM');
    const { campaignId, encounterId } = await createTieEncounter(page, 'InitReorder Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // Reorder affordances render only inside the tie group — Hero (18) gets none.
    await expect(page.getByRole('button', { name: 'Move Goblin A down' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Move Goblin B up' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^move hero/i })).toHaveCount(0);

    await page.getByRole('button', { name: 'Move Goblin A down' }).click();
    await expect
      .poll(() => initiativeOrder(page))
      .toEqual(['Initiative for Hero', 'Initiative for Goblin B', 'Initiative for Goblin A']);

    // The swap reached the server.
    await page.reload();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect
      .poll(() => initiativeOrder(page))
      .toEqual(['Initiative for Hero', 'Initiative for Goblin B', 'Initiative for Goblin A']);
  });
});
