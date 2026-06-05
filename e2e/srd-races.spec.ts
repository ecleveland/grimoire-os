import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

// Registering via page.request stores the Set-Cookie so subsequent page
// navigations are authenticated (mirrors srd-items.spec.ts).
async function registerAndLogin(page: Page): Promise<void> {
  const username = `race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'E2E Race Viewer' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

test.describe('SRD race lineage tables (VEG-273)', () => {
  test('expands Dragonborn to reveal the reconstructed Draconic Ancestors table', async ({
    page,
  }) => {
    await registerAndLogin(page);

    await page.goto('/srd/races');
    await expect(page.getByRole('heading', { name: /^Races$/ })).toBeVisible();

    // No trait tables render until a race is expanded.
    await expect(page.getByRole('table')).toHaveCount(0);

    const toggle = page.getByRole('button', { name: /Dragonborn/ });
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await toggle.click();

    // The Draconic Ancestors lineage table renders as a real <table>, not literal pipes.
    const table = page.getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Damage Type' })).toBeVisible();
    await expect(table.getByRole('cell', { name: 'Acid', exact: true }).first()).toBeVisible();

    // Collapsing the race hides the table again.
    await toggle.click();
    await expect(page.getByRole('table')).toHaveCount(0);
  });
});
