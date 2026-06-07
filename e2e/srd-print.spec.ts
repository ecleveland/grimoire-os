import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

// Registering via page.request stores the Set-Cookie so subsequent page
// navigations are authenticated (mirrors srd-print-selection.spec.ts).
async function registerAndLogin(page: Page): Promise<void> {
  const username = `printout-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'E2E Print Output' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

// /srd/print output golden path (VEG-268): the print set renders as 4-up
// index cards grouped by type, only the cards survive print emulation, and
// the on-screen controls (paper toggle, Print button) work.
test.describe('SRD print output (VEG-268)', () => {
  test('renders the print set as grouped index cards with working controls', async ({ page }) => {
    await registerAndLogin(page);

    // Build a two-type print set: a monster and an item.
    await page.goto('/srd/monsters');
    const addMonster = page.getByRole('button', { name: /^Add .+ to print set$/ }).first();
    await expect(addMonster).toBeVisible({ timeout: 10_000 });
    await addMonster.click();

    await page.goto('/srd/items');
    const addItem = page.getByRole('button', { name: /^Add .+ to print set$/ }).first();
    await expect(addItem).toBeVisible({ timeout: 10_000 });
    await addItem.click();

    // "Print (2)" lands on /srd/print with hydrated cards, grouped by type.
    await page.getByRole('link', { name: 'Print (2)' }).click();
    await expect(page).toHaveURL('/srd/print');
    await expect(page.getByTestId('print-card')).toHaveCount(2, { timeout: 10_000 });

    const groups = page.getByTestId('print-group');
    await expect(groups).toHaveCount(2);
    await expect(groups.first()).toHaveAttribute('data-card-type', 'monster');
    await expect(groups.last()).toHaveAttribute('data-card-type', 'item');
    await expect(page.getByRole('heading', { name: 'Monsters' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();

    // A4/Letter toggle swaps the emitted @page size. A <style> element never
    // renders text, so text-matchers see "" — read textContent directly.
    const styleText = () =>
      page.getByTestId('print-page-style').evaluate(el => el.textContent ?? '');
    await expect.poll(styleText).toContain('size: letter landscape');
    await page.getByRole('button', { name: 'A4' }).click();
    await expect.poll(styleText).toContain('size: A4 landscape');

    // Print button invokes window.print().
    await page.evaluate(() => {
      (window as unknown as { __printed: boolean }).__printed = false;
      window.print = () => {
        (window as unknown as { __printed: boolean }).__printed = true;
      };
    });
    await page.getByRole('button', { name: 'Print' }).click();
    expect(await page.evaluate(() => (window as unknown as { __printed: boolean }).__printed)).toBe(
      true
    );

    // Under print emulation only the cards remain: no app chrome, no controls.
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('print-card').first()).toBeVisible();
    await expect(page.getByTestId('print-controls')).toBeHidden();
    // The app nav (`body > header`) is hidden in print. Each PrintCard's own
    // nested <header> must remain visible — it carries the card's name band.
    await expect(page.locator('body > header')).toBeHidden();
    await expect(page.getByTestId('print-card').first().locator('header')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Print (2)' })).toBeHidden();
    await page.emulateMedia({ media: null });
  });

  test('shows the empty state when visiting /srd/print with no selection', async ({ page }) => {
    await registerAndLogin(page);

    await page.goto('/srd/print');
    await expect(page.getByText(/print set is empty/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: 'Browse the SRD' })).toBeVisible();
  });
});
