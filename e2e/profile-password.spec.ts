import { expect, test } from '@playwright/test';
import { BACKEND, registerAndLogin } from './helpers';

const NEW_PASSWORD = 'NewTestPass2!';

// A wrong current password is a 400, not a 401. apiFetch reads any 401 as an
// expired session, refreshes, retries, and signs the user out, so the profile
// Vitest spec (which mocks apiFetch) cannot see this regression.
test.describe('Profile password change', () => {
  test('a wrong current password toasts the error and keeps the user signed in', async ({
    page,
  }) => {
    await registerAndLogin(page, 'pw-wrong', 'E2E Password');

    await page.goto('/profile');
    await page.getByLabel(/current password/i).fill('NotMyPassword1!');
    await page.getByLabel(/^new password/i).fill(NEW_PASSWORD);
    await page.getByLabel(/confirm new password/i).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: /change password/i }).click();

    await expect(page.getByText('Current password is incorrect')).toBeVisible();
    await expect(page).toHaveURL(/\/profile$/);

    const me = await page.request.get(`${BACKEND}/api/users/me`);
    expect(me.status()).toBe(200);
  });

  test('the right current password changes it and the new one logs in', async ({ page }) => {
    await registerAndLogin(page, 'pw-right', 'E2E Password');
    const me = await page.request.get(`${BACKEND}/api/users/me`);
    expect(me.ok(), `me failed: ${me.status()}`).toBeTruthy();
    const username = (await me.json()).username as string;

    await page.goto('/profile');
    await page.getByLabel(/current password/i).fill('TestPass1!');
    await page.getByLabel(/^new password/i).fill(NEW_PASSWORD);
    await page.getByLabel(/confirm new password/i).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: /change password/i }).click();

    await expect(page.getByText('Password changed')).toBeVisible();

    const login = await page.request.post(`${BACKEND}/api/auth/login`, {
      data: { username, password: NEW_PASSWORD },
    });
    expect(login.status()).toBe(200);
  });
});
