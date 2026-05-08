import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  test('home page renders', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.ok(), `GET / returned ${response?.status()}`).toBeTruthy();
    await expect(page).toHaveTitle(/grimoire/i);
  });

  test('backend health responds', async ({ request }) => {
    const apiUrl = test.info().config.metadata?.backendUrl ?? 'http://localhost:3001';
    const response = await request.get(`${apiUrl}/api/docs`);
    expect(response.status()).toBeLessThan(500);
  });
});
