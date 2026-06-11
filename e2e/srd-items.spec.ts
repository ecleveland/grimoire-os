import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

// Registering via page.request stores the Set-Cookie so subsequent page
// navigations are authenticated (mirrors monster-stat-block.spec.ts).
async function registerAndLogin(page: Page): Promise<void> {
  const username = `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'E2E Item Viewer' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

test.describe('SRD basic equipment (VEG-308)', () => {
  test('finds seeded equipment by search and filters by the new categories', async ({ page }) => {
    await registerAndLogin(page);

    await page.goto('/srd/items');
    await expect(page.getByRole('heading', { name: /^Items$/ })).toBeVisible();

    // A seeded weapon from the extracted Weapons table, with table data intact.
    await page.getByPlaceholder('Search items...').fill('Longsword');
    const longsword = page.getByTestId('item-card').filter({ hasText: 'Longsword' }).first();
    await expect(longsword).toBeVisible({ timeout: 10_000 });
    await expect(longsword.getByText('Martial Melee Weapon')).toBeVisible();
    await expect(longsword.getByText('Cost: 15 GP')).toBeVisible();
    await expect(longsword.getByText('Mastery: Sap')).toBeVisible();

    // The category filter matches the seeded values: all 7 equipment packs.
    await page.getByPlaceholder('Search items...').clear();
    await page.getByRole('combobox').selectOption('Equipment Pack');
    await expect(page.getByText('7 items found')).toBeVisible({ timeout: 10_000 });
    const burglars = page.getByTestId('item-card').filter({ hasText: 'Burglar’s Pack' });
    await expect(burglars).toBeVisible();

    // Pack contents survive in the description prose.
    await burglars.getByRole('button', { name: 'Show details' }).click();
    await expect(burglars.getByText(/10 Candles/)).toBeVisible();
  });
});

test.describe('SRD magic-item descriptions (VEG-272)', () => {
  test('expands a magic item to reveal its reconstructed table', async ({ page }) => {
    await registerAndLogin(page);

    await page.goto('/srd/items');
    await expect(page.getByRole('heading', { name: /^Items$/ })).toBeVisible();

    // Find a magic item with a reconstructed table by name (seeded SRD data).
    await page.getByPlaceholder('Search items...').fill('Dragon Scale Mail');
    const card = page.getByTestId('item-card').filter({ hasText: 'Dragon Scale Mail' });
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Magic-item metadata renders, and the description is collapsed by default.
    await expect(card.getByText('Very Rare', { exact: true })).toBeVisible();
    const toggle = card.getByRole('button', { name: 'Show details' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(card.getByRole('table')).toHaveCount(0);

    // Expanding renders the reconstructed table as a real <table>, not token soup.
    await toggle.click();
    const table = card.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Resistance' })).toBeVisible();
    await expect(table.getByRole('cell', { name: 'Acid', exact: true }).first()).toBeVisible();

    // And it collapses again.
    await card.getByRole('button', { name: 'Hide details' }).click();
    await expect(card.getByRole('table')).toHaveCount(0);
  });
});
