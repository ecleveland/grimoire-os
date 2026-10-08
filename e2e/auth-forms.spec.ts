import { expect, test, type Page } from '@playwright/test';
import { BACKEND, escapeRegExp } from './helpers';

// The one spec that drives the login and register forms on purpose (VEG-544).
// Every other spec authenticates through the API.
const PASSWORD = 'TestPass1!';
const PASSWORD_REQUIREMENTS_TEXT =
  'Must be at least 10 characters and include uppercase, lowercase, a number, and a special character.';

function uniqueUsername(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// The inputs are controlled, so a fill made before React hydrates the document
// is reset to '' and the submit trips the browser's required check. toHaveURL
// passes before hydration; networkidle waits for hydration and the
// AuthProvider's /users/me fetch.
async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
}

// Asserting the value makes a hydration reset fail here, not as a URL timeout.
async function fillField(page: Page, label: RegExp, value: string): Promise<void> {
  const field = page.getByLabel(label);
  await field.fill(value);
  await expect(field).toHaveValue(value);
}

// Required fields render their label as "Password *", and "Confirm Password *"
// also contains "Password", so the anchored regexes keep each match to one field.
async function fillLogin(page: Page, username: string, password: string): Promise<void> {
  await waitForHydration(page);
  await fillField(page, /^Username/, username);
  await fillField(page, /^Password/, password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

async function expectSignedIn(page: Page, displayName: string): Promise<void> {
  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp(`^${escapeRegExp(displayName)}$`) })
  ).toBeVisible();
}

test.describe('Auth forms', () => {
  test('registering through the form signs the user in', async ({ page }) => {
    const username = uniqueUsername('reg-form');
    const displayName = 'Form Registrant';

    await page.goto('/register');
    await waitForHydration(page);
    await fillField(page, /^Username/, username);
    await fillField(page, /^Display Name/, displayName);
    await fillField(page, /^Password/, PASSWORD);
    await fillField(page, /^Confirm Password/, PASSWORD);
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();

    await expectSignedIn(page, displayName);

    const me = await page.request.get(`${BACKEND}/api/users/me`);
    expect(me.status()).toBe(200);
    expect((await me.json()).username).toBe(username);
  });

  test('logging out and back in through the form', async ({ page }) => {
    const username = uniqueUsername('login-form');
    const displayName = 'Form Login';
    const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
      data: { username, password: PASSWORD, displayName },
    });
    expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();

    await page.goto('/');
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });

    await fillLogin(page, username, PASSWORD);

    await expectSignedIn(page, displayName);
    const me = await page.request.get(`${BACKEND}/api/users/me`);
    expect(me.status()).toBe(200);
    expect((await me.json()).username).toBe(username);
  });

  // The account is registered through the `request` fixture, whose cookies are
  // separate from the page's, so the browser starts signed out.
  test('a wrong password shows the inline error and stays signed out', async ({
    page,
    request,
  }) => {
    const username = uniqueUsername('bad-pass');
    const reg = await request.post(`${BACKEND}/api/auth/register`, {
      data: { username, password: PASSWORD },
    });
    expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();

    await page.goto('/login');
    await fillLogin(page, username, 'WrongPass1!');

    await expect(page.getByText('Invalid credentials', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/login$/);
    const me = await page.request.get(`${BACKEND}/api/users/me`);
    expect(me.status()).toBe(401);
  });

  test('a weak password is rejected before any account is created', async ({ page, request }) => {
    const username = uniqueUsername('weak-pass');

    await page.goto('/register');
    await expect(page.getByText(PASSWORD_REQUIREMENTS_TEXT, { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await waitForHydration(page);
    await fillField(page, /^Username/, username);
    await fillField(page, /^Password/, 'weak');
    await fillField(page, /^Confirm Password/, 'weak');
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();

    await expect(
      page.getByText('Password must be at least 10 characters', { exact: true })
    ).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);

    const login = await request.post(`${BACKEND}/api/auth/login`, {
      data: { username, password: 'weak' },
    });
    expect(login.status()).toBe(401);
  });

  test('a mismatched confirmation is rejected before any account is created', async ({
    page,
    request,
  }) => {
    const username = uniqueUsername('mismatch');

    await page.goto('/register');
    await waitForHydration(page);
    await fillField(page, /^Username/, username);
    await fillField(page, /^Password/, PASSWORD);
    await fillField(page, /^Confirm Password/, 'TestPass2!');
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();

    await expect(page.getByText('Passwords do not match', { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/register$/);

    const login = await request.post(`${BACKEND}/api/auth/login`, {
      data: { username, password: PASSWORD },
    });
    expect(login.status()).toBe(401);
  });

  test('a signed-in user visiting /login is sent home', async ({ page }) => {
    const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
      data: { username: uniqueUsername('signed-in'), password: PASSWORD },
    });
    expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();

    await page.goto('/login');

    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
  });
});
