import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

// Register via page.request so the Set-Cookie authenticates later navigations
// (mirrors monster-stat-block.spec.ts / npc-generator.spec.ts).
async function registerAndLogin(page: Page): Promise<void> {
  const username = `enc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'E2E Encounter DM' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

// Mutating endpoints enforce the CSRF double-submit cookie (VEG-277): read the
// non-httpOnly csrf_token cookie and echo it back in the x-csrf-token header.
async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const csrf = (await page.context().cookies()).find(c => c.name === 'csrf_token');
  expect(csrf?.value, 'csrf_token cookie missing').toBeTruthy();
  return { 'x-csrf-token': csrf!.value };
}

async function createEncounter(page: Page): Promise<{ campaignId: string; encounterId: string }> {
  const headers = await csrfHeaders(page);

  const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
    data: { name: `Lookup Camp ${Date.now()}` },
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

test.describe('Encounter monster-lookup panel (VEG-259)', () => {
  test('searches a monster and opens its stat block without disrupting the encounter', async ({
    page,
  }) => {
    await registerAndLogin(page);
    const { campaignId, encounterId } = await createEncounter(page);

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // The lookup panel is present and unobtrusive — no results until you search.
    await expect(page.getByText(/monster lookup/i)).toBeVisible();
    const search = page.getByPlaceholder(/search monsters/i);
    await expect(search).toBeVisible();
    await expect(page.getByText(/type to search/i)).toBeVisible();

    // Debounced search hits /srd/monsters and renders compact results.
    await search.fill('goblin');
    const result = page.getByTestId('lookup-result').first();
    await expect(result).toBeVisible({ timeout: 10_000 });

    // Selecting a result opens the shared stat block in the overlay.
    await result.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();
    await expect(dialog.getByText('NaN')).toHaveCount(0);

    // Closing the overlay leaves the encounter intact.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
  });
});
