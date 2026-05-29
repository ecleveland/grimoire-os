import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

// Registering via page.request stores the Set-Cookie from /auth/register in the
// page's browser context, so subsequent page navigations and page.request calls
// are automatically authenticated. The csrf_token cookie is non-httpOnly so we
// read it here and forward it as x-csrf-token on every mutating request.
async function registerDm(page: Page): Promise<{ csrf: string }> {
  const username = `dm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const password = 'TestPass1!';

  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password, displayName: 'E2E DM' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();

  const csrf = (await page.context().cookies()).find(c => c.name === 'csrf_token')?.value;
  expect(csrf, 'csrf_token cookie missing after register').toBeTruthy();
  return { csrf: csrf! };
}

async function createCharacter(page: Page, name: string, csrf: string): Promise<string> {
  const res = await page.request.post(`${BACKEND}/api/characters`, {
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
    headers: { 'x-csrf-token': csrf },
  });
  expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return body.id;
}

test.describe('ConfirmDialog (delete character flow)', () => {
  test('cancelling the dialog does not delete the character', async ({ page }) => {
    const { csrf } = await registerDm(page);
    const charName = `E2E Cancel ${Date.now()}`;
    const charId = await createCharacter(page, charName, csrf);

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
    const verifyRes = await page.request.get(`${BACKEND}/api/characters/${charId}`);
    expect(verifyRes.ok()).toBeTruthy();
  });

  test('Escape key cancels the dialog without deleting', async ({ page }) => {
    const { csrf } = await registerDm(page);
    const charName = `E2E Esc ${Date.now()}`;
    const charId = await createCharacter(page, charName, csrf);

    await page.goto(`/characters/${charId}/edit`);
    await page.getByRole('button', { name: /^delete$/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    const verifyRes = await page.request.get(`${BACKEND}/api/characters/${charId}`);
    expect(verifyRes.ok()).toBeTruthy();
  });

  test('confirming the dialog deletes the character', async ({ page }) => {
    const { csrf } = await registerDm(page);
    const charName = `E2E Delete ${Date.now()}`;
    const charId = await createCharacter(page, charName, csrf);

    await page.goto(`/characters/${charId}/edit`);
    await page.getByRole('button', { name: /^delete$/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: /^delete$/i }).click();
    await page.waitForURL(/\/characters$/, { timeout: 10_000 });

    // Character should be gone (404)
    const verifyRes = await page.request.get(`${BACKEND}/api/characters/${charId}`);
    expect(verifyRes.status()).toBe(404);
  });
});
