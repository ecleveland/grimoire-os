import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

// Registering via page.request stores the Set-Cookie so subsequent page
// navigations are authenticated (mirrors npc-generator.spec.ts).
async function registerAndLogin(page: Page): Promise<void> {
  const username = `mon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'E2E Monster Viewer' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

test.describe('Monster stat block (VEG-257)', () => {
  test('opens a monster stat block in a modal from the SRD monsters page', async ({ page }) => {
    await registerAndLogin(page);

    await page.goto('/srd/monsters');
    await expect(page.getByRole('heading', { name: /^Monsters$/ })).toBeVisible();

    // Wait for the seeded SRD monsters to load, then open the first card.
    const firstCard = page.getByTestId('monster-card').first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();

    // Stat block opens in an accessible dialog.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('monster-stat-block')).toBeVisible();
    // Core stat-block scaffolding is present (ability grid always renders;
    // optional sections like Actions depend on the specific monster's data).
    await expect(dialog.getByText(/CR /)).toBeVisible();
    await expect(dialog.getByText('STR', { exact: true })).toBeVisible();
    // Ability scores must resolve to real computed modifiers, not NaN (VEG-257
    // regression guard: the API uses str/dex/... + numeric HP/CR).
    await expect(dialog.getByText('NaN')).toHaveCount(0);
    await expect(dialog.getByText(/\([+-]\d+\)/).first()).toBeVisible();

    // Escape closes it.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
