import { expect, test } from '@playwright/test';
import { BACKEND, registerAndLogin } from './helpers';

// Drives the create-campaign form on purpose (VEG-544); other specs create
// campaigns through the API.
const CAMPAIGN_URL = /\/campaigns\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

test.describe('Create campaign', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLogin(page, 'camp-create', 'E2E Creator');
  });

  test('the form creates a campaign and the owner can generate its invite code', async ({
    page,
  }) => {
    const name = `Form Campaign ${Date.now()}`;

    await page.goto('/campaigns/new');
    await page.getByLabel(/^Name/).fill(name, { timeout: 10_000 });
    await page.getByLabel(/^Description/).fill('A campaign made through the form.');
    await page.getByLabel(/^Setting/).fill('Forgotten Realms');
    await page.getByRole('button', { name: 'Create Campaign', exact: true }).click();

    await expect(page.getByText('Campaign created!', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(CAMPAIGN_URL, { timeout: 10_000 });
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible({ timeout: 10_000 });
    const id = CAMPAIGN_URL.exec(new URL(page.url()).pathname)![1];

    const created = await page.request.get(`${BACKEND}/api/campaigns/${id}`);
    expect(created.status()).toBe(200);
    const body = await created.json();
    expect(body).toMatchObject({
      name,
      description: 'A campaign made through the form.',
      setting: 'Forgotten Realms',
    });
    expect(body.inviteCode ?? null).toBeNull();

    await page.getByRole('button', { name: 'Generate Invite Code', exact: true }).click();
    await expect(page.getByText('Invite code generated!', { exact: true })).toBeVisible();
    const code = page.locator('code');
    await expect(code).toHaveText(/^\S+$/);
    const shown = (await code.textContent())!.trim();

    const after = await page.request.get(`${BACKEND}/api/campaigns/${id}`);
    expect(after.status()).toBe(200);
    expect((await after.json()).inviteCode).toBe(shown);
  });

  // Name is a required input, so the browser blocks submission before the
  // page's handler runs.
  test('an empty name does not create a campaign', async ({ page }) => {
    await page.goto('/campaigns/new');
    await page.getByLabel(/^Setting/).fill('Nowhere', { timeout: 10_000 });
    await page.getByRole('button', { name: 'Create Campaign', exact: true }).click();

    const nameInput = page.getByLabel(/^Name/);
    expect(await nameInput.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
    await expect(page).toHaveURL(/\/campaigns\/new$/);
    await expect(page.getByText('Campaign created!', { exact: true })).toHaveCount(0);

    const list = await page.request.get(`${BACKEND}/api/campaigns`);
    expect(list.status()).toBe(200);
    expect((await list.json()).total).toBe(0);
  });
});
