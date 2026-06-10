import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

// Register via page.request so the Set-Cookie authenticates later navigations
// (mirrors encounter-add-monster.spec.ts).
async function registerAndLogin(page: Page): Promise<void> {
  const username = `hp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'E2E HP-Edit DM' },
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
    data: { name: `HP Camp ${Date.now()}` },
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

test.describe('Encounter HP edits commit once, version-guarded (VEG-315)', () => {
  test('typing an HP value sends a single PATCH on Enter and the value persists', async ({
    page,
  }) => {
    await registerAndLogin(page);
    const { campaignId, encounterId } = await createEncounter(page);

    const patches: string[] = [];
    page.on('request', req => {
      if (req.method() === 'PATCH' && req.url().includes(`/encounters/${encounterId}`)) {
        patches.push(req.postData() ?? '');
      }
    });

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // Type "10" keystroke-by-keystroke — no PATCH may fire while typing.
    const hpInput = page.getByRole('spinbutton');
    await hpInput.click();
    await hpInput.clear();
    await hpInput.pressSequentially('10');
    expect(patches).toHaveLength(0);

    // Enter commits exactly one PATCH, carrying the optimistic-lock guard.
    await hpInput.press('Enter');
    await expect.poll(() => patches.length).toBe(1);
    const body = JSON.parse(patches[0]);
    expect(body.expectedVersion).toBeDefined();
    expect(body.combatants[0].hp).toBe(10);

    // The committed value survives a reload — it reached the server.
    await page.reload();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect(page.getByRole('spinbutton')).toHaveValue('10');
  });
});
