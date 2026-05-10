import { expect, test } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

interface AuthFixture {
  token: string;
  campaignId: string;
}

async function setup(request: import('@playwright/test').APIRequestContext): Promise<AuthFixture> {
  const username = `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'TestPass1!';

  const reg = await request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password, displayName: 'E2E DM' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
  const { access_token: token } = await reg.json();

  const camp = await request.post(`${BACKEND}/api/campaigns`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: `E2E Campaign ${Date.now()}`, status: 'active' },
  });
  expect(camp.ok(), `campaign create failed: ${camp.status()}`).toBeTruthy();
  const { id: campaignId } = await camp.json();

  return { token, campaignId };
}

async function injectAuth(page: import('@playwright/test').Page, token: string) {
  // Visit a non-protected route to establish origin, then seed localStorage + cookie.
  await page.goto('/login');
  await page.evaluate(t => {
    localStorage.setItem('token', t);
    const payload = JSON.parse(atob(t.split('.')[1]));
    localStorage.setItem(
      'user',
      JSON.stringify({ userId: payload.sub, username: payload.username, role: payload.role })
    );
    document.cookie = 'auth-flag=1; path=/; SameSite=Lax';
  }, token);
}

test.describe('NPC Generator', () => {
  test('generate preview, save, and view detail', async ({ page, request }) => {
    const { token, campaignId } = await setup(request);
    await injectAuth(page, token);

    await page.goto(`/campaigns/${campaignId}/npcs/new`);
    await expect(page.getByRole('heading', { name: /generate npc/i })).toBeVisible();

    await page.getByRole('button', { name: /generate preview/i }).click();
    // Preview panel exposes a Save button distinct from the Generate Preview button
    const saveButton = page.getByRole('button', { name: /^save$/i });
    await expect(saveButton).toBeVisible({ timeout: 10_000 });

    await saveButton.click();
    await page.waitForURL(new RegExp(`/campaigns/${campaignId}/npcs/[a-f0-9-]+$`), {
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: /reroll all/i })).toBeVisible();
  });

  test('combat-relevant toggle produces a stat block card in the preview', async ({
    page,
    request,
  }) => {
    const { token, campaignId } = await setup(request);
    await injectAuth(page, token);

    await page.goto(`/campaigns/${campaignId}/npcs/new`);
    await page.getByLabel(/combat-relevant/i).check();
    await page.getByRole('button', { name: /generate preview/i }).click();

    await expect(page.getByTestId('npc-stat-block')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Based on/i)).toBeVisible();
  });

  test('Generate Stat Block button promotes a Lite NPC to Full', async ({ page, request }) => {
    const { token, campaignId } = await setup(request);

    const npcRes = await request.post(`${BACKEND}/api/npcs/generate`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { campaignId, profession: 'guard' },
    });
    expect(npcRes.ok(), `generate failed: ${npcRes.status()}`).toBeTruthy();
    const preview = await npcRes.json();
    const saveRes = await request.post(`${BACKEND}/api/npcs`, {
      headers: { Authorization: `Bearer ${token}` },
      data: preview,
    });
    expect(saveRes.ok(), `save failed: ${saveRes.status()}`).toBeTruthy();
    const saved = await saveRes.json();

    await injectAuth(page, token);
    await page.goto(`/campaigns/${campaignId}/npcs/${saved.id}`);

    const generateButton = page.getByRole('button', { name: /generate stat block/i });
    await expect(generateButton).toBeVisible();
    await generateButton.click();
    await expect(page.getByTestId('npc-stat-block')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /remove stat block/i })).toBeVisible();
  });

  test('list page shows saved NPC and links to detail', async ({ page, request }) => {
    const { token, campaignId } = await setup(request);

    const npcRes = await request.post(`${BACKEND}/api/npcs`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { campaignId, name: 'E2E Listed NPC', race: 'Human', profession: 'Peasant' },
    });
    expect(npcRes.ok(), `npc create failed: ${npcRes.status()}`).toBeTruthy();

    await injectAuth(page, token);
    await page.goto(`/campaigns/${campaignId}/npcs`);

    await expect(page.getByRole('link', { name: /E2E Listed NPC/i })).toBeVisible();
    await page.getByRole('link', { name: /E2E Listed NPC/i }).click();
    await page.waitForURL(new RegExp(`/campaigns/${campaignId}/npcs/[a-f0-9-]+$`));
    await expect(page.getByRole('heading', { name: 'E2E Listed NPC' })).toBeVisible();
  });
});
