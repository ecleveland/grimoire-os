import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

// Registering via page.request stores the Set-Cookie so subsequent page
// navigations are authenticated (mirrors srd-races.spec.ts).
async function registerAndLogin(page: Page): Promise<void> {
  const username = `print-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'E2E Print Selector' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

// Selection UI golden path (VEG-265): build a print set across SRD pages, the
// tray badge tracks the live count and persists across navigation, clear-all
// empties it. The /srd/print output itself is covered by VEG-269.
test.describe('SRD print set selection (VEG-265)', () => {
  test('builds a cross-page print set with a persistent tray badge', async ({ page }) => {
    await registerAndLogin(page);

    // 1. Add a monster from its list card.
    await page.goto('/srd/monsters');
    const addMonster = page.getByRole('button', { name: /^Add .+ to print set$/ }).first();
    await expect(addMonster).toBeVisible({ timeout: 10_000 });
    await addMonster.click();
    await expect(page.getByRole('link', { name: 'Print (1)' })).toBeVisible();

    // 2. Add an individual race trait (feature chip) from the races page.
    await page.goto('/srd/races');
    const raceToggle = page.getByRole('button', { name: /^Dragonborn/ });
    await expect(raceToggle).toBeVisible({ timeout: 10_000 });
    await raceToggle.click();
    await page
      .getByRole('button', { name: /^Add .+ to print set$/ })
      .first()
      .click();
    await expect(page.getByRole('link', { name: 'Print (2)' })).toBeVisible();

    // 3. The tray persists across navigation (and a hard reload).
    await page.goto('/srd/items');
    await expect(page.getByRole('link', { name: 'Print (2)' })).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByRole('link', { name: 'Print (2)' })).toBeVisible({ timeout: 10_000 });

    // 4. The Print action routes to the print surface.
    expect(await page.getByRole('link', { name: 'Print (2)' }).getAttribute('href')).toBe(
      '/srd/print'
    );

    // 5. Clear-all empties the tray and hides the badge.
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByRole('link', { name: /^Print \(/ })).toHaveCount(0);
  });

  test('deselecting from a card updates the badge count', async ({ page }) => {
    await registerAndLogin(page);

    await page.goto('/srd/monsters');
    const addMonster = page.getByRole('button', { name: /^Add .+ to print set$/ }).first();
    await expect(addMonster).toBeVisible({ timeout: 10_000 });
    await addMonster.click();
    await expect(page.getByRole('link', { name: 'Print (1)' })).toBeVisible();

    await page
      .getByRole('button', { name: /^Remove .+ from print set$/ })
      .first()
      .click();
    await expect(page.getByRole('link', { name: /^Print \(/ })).toHaveCount(0);
  });
});
