import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

// Register via page.request so the Set-Cookie authenticates later navigations
// (mirrors encounter-monster-lookup.spec.ts).
async function registerAndLogin(page: Page): Promise<void> {
  const username = `add-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'E2E Add-Monster DM' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

// Mutating endpoints enforce the CSRF double-submit cookie (VEG-277).
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const csrf = (await page.context().cookies()).find(c => c.name === 'csrf_token');
  expect(csrf?.value, 'csrf_token cookie missing').toBeTruthy();
  return { 'x-csrf-token': csrf!.value };
}

async function createEncounter(page: Page): Promise<{ campaignId: string; encounterId: string }> {
  const headers = await csrfHeaders(page);

  const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
    data: { name: `Add Camp ${Date.now()}` },
    headers,
  });
  expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
  const campaignId = (await campRes.json()).id as string;

  const encRes = await page.request.post(`${BACKEND}/api/encounters`, {
    data: {
      campaignId,
      name: 'Goblin Ambush',
      combatants: [{ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, ac: 16, isNpc: false }],
    },
    headers,
  });
  expect(encRes.ok(), `encounter create failed: ${encRes.status()}`).toBeTruthy();
  const encounterId = (await encRes.json()).id as string;

  return { campaignId, encounterId };
}

test.describe('Add monster to encounter + click-combatant-to-view (VEG-260)', () => {
  test('DM adds a monster from the lookup panel, then re-opens its stat block from the tracker', async ({
    page,
  }) => {
    await registerAndLogin(page);
    const { campaignId, encounterId } = await createEncounter(page);

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // Search the compendium and open the goblin stat block.
    await page.getByPlaceholder(/search monsters/i).fill('goblin');
    const result = page.getByTestId('lookup-result').first();
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();

    // Capture the monster's name from the stat block — the first 'goblin' match
    // is whatever the seeded compendium ranks first, so don't hard-code it.
    const monsterName = ((await dialog.locator('h3').first().textContent()) ?? '').trim();
    expect(monsterName.length).toBeGreaterThan(0);

    // Add-to-encounter CTA → quantity/initiative dialog → confirm.
    await dialog.getByRole('button', { name: /add to encounter/i }).click();
    await expect(dialog.getByLabel('Quantity')).toBeVisible();
    await dialog.getByRole('button', { name: /add to encounter/i }).click();

    // Overlay closes and a linked NPC combatant (named after the monster) joins
    // the tracker — the name is a button precisely because it carries a monsterId.
    await expect(page.getByRole('dialog')).toBeHidden();
    const combatant = page.getByRole('button', { name: monsterName, exact: true }).first();
    await expect(combatant).toBeVisible();

    // Clicking the linked combatant re-opens its source stat block (VEG-260).
    await combatant.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();
  });
});
