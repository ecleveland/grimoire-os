import { expect, test } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

interface AuthFixture {
  token: string;
}

async function setup(
  request: import('@playwright/test').APIRequestContext
): Promise<AuthFixture> {
  const username = `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'TestPass1!';

  const reg = await request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password, displayName: 'E2E DM' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
  const { access_token: token } = await reg.json();

  return { token };
}

async function injectAuth(page: import('@playwright/test').Page, token: string) {
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

async function createCharacter(
  request: import('@playwright/test').APIRequestContext,
  token: string,
  name: string
): Promise<string> {
  const res = await request.post(`${BACKEND}/api/characters`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name,
      race: 'Human',
      class: 'Fighter',
      level: 1,
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
  });
  expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return body.id;
}

test.describe('ConfirmDialog (delete character flow)', () => {
  test('cancelling the dialog does not delete the character', async ({ page, request }) => {
    const { token } = await setup(request);
    const charName = `E2E Cancel ${Date.now()}`;
    const charId = await createCharacter(request, token, charName);
    await injectAuth(page, token);

    await page.goto(`/characters/${charId}/edit`);
    await expect(page.getByRole('heading', { name: /edit character/i })).toBeVisible();

    await page.getByRole('button', { name: /^delete$/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/delete character\?/i)).toBeVisible();

    // Cancel
    await dialog.getByRole('button', { name: /^cancel$/i }).click();
    await expect(dialog).not.toBeVisible();

    // Character still exists
    const verifyRes = await request.get(`${BACKEND}/api/characters/${charId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(verifyRes.ok()).toBeTruthy();
  });

  test('Escape key cancels the dialog without deleting', async ({ page, request }) => {
    const { token } = await setup(request);
    const charName = `E2E Esc ${Date.now()}`;
    const charId = await createCharacter(request, token, charName);
    await injectAuth(page, token);

    await page.goto(`/characters/${charId}/edit`);
    await page.getByRole('button', { name: /^delete$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const verifyRes = await request.get(`${BACKEND}/api/characters/${charId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(verifyRes.ok()).toBeTruthy();
  });

  test('confirming the dialog deletes the character', async ({ page, request }) => {
    const { token } = await setup(request);
    const charName = `E2E Delete ${Date.now()}`;
    const charId = await createCharacter(request, token, charName);
    await injectAuth(page, token);

    await page.goto(`/characters/${charId}/edit`);
    await page.getByRole('button', { name: /^delete$/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /^delete$/i }).click();
    await page.waitForURL(/\/characters$/, { timeout: 10_000 });

    // Character should be gone (404)
    const verifyRes = await request.get(`${BACKEND}/api/characters/${charId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(verifyRes.status()).toBe(404);
  });
});
