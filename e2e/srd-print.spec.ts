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

    const groups = page.getByTestId('print-group');
    await expect(groups).toHaveCount(2, { timeout: 10_000 });
    await expect(groups.first()).toHaveAttribute('data-card-type', 'monster');
    await expect(groups.last()).toHaveAttribute('data-card-type', 'item');
    // Each type produced at least one card. We assert per group, not on the
    // total print-card count: a monster card may overflow into continuation
    // cards (VEG-275), so the physical card count exceeds the entry count.
    await expect(groups.first().getByTestId('print-card').first()).toBeVisible();
    await expect(groups.last().getByTestId('print-card')).toHaveCount(1);
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

const addToSetButton = /^Add .+ to print set$/;

// Full golden path (VEG-269): a mixed set assembled across three SRD pages —
// a monster (/srd/monsters), a spell (/srd/search), and an individual class
// feature (/srd/classes) — persists across navigation and a reload, then
// prints as cards grouped by type. The individual-feature path is the headline:
// it must surface as its own card tagged with its parent ("Class · <Name>"),
// and that tag must survive print emulation alongside the cards themselves.
test.describe('SRD print golden path (VEG-269)', () => {
  test('builds a mixed cross-page set and prints grouped cards under print emulation', async ({
    page,
  }) => {
    await registerAndLogin(page);

    // 1. Monster, from its list card.
    await page.goto('/srd/monsters');
    const addMonster = page.getByRole('button', { name: addToSetButton }).first();
    await expect(addMonster).toBeVisible({ timeout: 10_000 });
    await addMonster.click();
    await expect(page.getByRole('link', { name: 'Print (1)' })).toBeVisible();

    // 2. Spell, from the unified search page narrowed to spells only. Disabling
    // Feats, Items, and Features leaves every result a spell, so the first
    // add-button is deterministically a spell regardless of seed ordering.
    await page.goto('/srd/search');
    await page.getByRole('button', { name: 'Feats' }).click();
    await page.getByRole('button', { name: 'Items' }).click();
    await page.getByRole('button', { name: 'Features' }).click();
    const addSpell = page.getByRole('button', { name: addToSetButton }).first();
    await expect(addSpell).toBeVisible({ timeout: 10_000 });
    await addSpell.click();
    await expect(page.getByRole('link', { name: 'Print (2)' })).toBeVisible();

    // 3. Individual class feature, from an expanded class's feature chips. Class
    // features carry DB-generated ids, so each chip is a real print toggle. Pin
    // the class name (the feature's parent) for the later parent-label check.
    await page.goto('/srd/classes');
    const firstClassToggle = page
      .getByRole('button')
      .filter({ has: page.getByRole('heading', { level: 2 }) })
      .first();
    await expect(firstClassToggle).toBeVisible({ timeout: 10_000 });
    const className = (await page.getByRole('heading', { level: 2 }).first().textContent())?.trim();
    expect(className, 'expected at least one class to be listed').toBeTruthy();
    await firstClassToggle.click();
    const addFeature = page.getByRole('button', { name: addToSetButton }).first();
    await expect(addFeature).toBeVisible({ timeout: 10_000 });
    const featureLabel = await addFeature.getAttribute('aria-label');
    const featureName = featureLabel?.replace(/^Add (.+) to print set$/, '$1');
    expect(featureName, 'expected a class feature chip').toBeTruthy();
    await addFeature.click();
    await expect(page.getByRole('link', { name: 'Print (3)' })).toBeVisible();

    // 4. The set persists across navigation to an unrelated page and a reload.
    await page.goto('/srd/items');
    await expect(page.getByRole('link', { name: 'Print (3)' })).toBeVisible({ timeout: 10_000 });
    await page.reload();
    await expect(page.getByRole('link', { name: 'Print (3)' })).toBeVisible({ timeout: 10_000 });

    // 5. "Print (3)" lands on /srd/print with all three entries hydrated and
    // grouped by type, in insertion order (monster → spell → feature).
    await page.getByRole('link', { name: 'Print (3)' }).click();
    await expect(page).toHaveURL('/srd/print');

    const groups = page.getByTestId('print-group');
    await expect(groups).toHaveCount(3, { timeout: 10_000 });
    await expect(groups.nth(0)).toHaveAttribute('data-card-type', 'monster');
    await expect(groups.nth(1)).toHaveAttribute('data-card-type', 'spell');
    await expect(groups.nth(2)).toHaveAttribute('data-card-type', 'feature');
    await expect(page.getByRole('heading', { name: 'Monsters' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Spells' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Features' })).toBeVisible();

    // Each selected entry is present. Asserted per group rather than on the
    // total print-card count: a monster card may overflow into continuation
    // cards (VEG-275), so the physical card count exceeds the three entries.
    // Spell and feature cards never paginate, so they are exactly one each.
    await expect(groups.nth(0).getByTestId('print-card').first()).toBeVisible();
    await expect(groups.nth(1).getByTestId('print-card')).toHaveCount(1);

    // The selected feature surfaces as its own card, tagged with its parent.
    const featureCard = page.locator('[data-card-type="feature"] [data-testid="print-card"]');
    await expect(featureCard).toHaveCount(1);
    await expect(featureCard).toContainText(featureName!);
    await expect(featureCard.locator('header')).toContainText(`Class · ${className}`);

    // 6. Under print emulation only the cards remain — no app chrome, no
    // controls — and the feature's parent label is still on its printed card.
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('print-card').first()).toBeVisible();
    await expect(page.getByTestId('print-controls')).toBeHidden();
    await expect(page.locator('body > header')).toBeHidden();
    await expect(page.getByRole('link', { name: 'Print (3)' })).toBeHidden();
    await expect(featureCard.locator('header')).toContainText(`Class · ${className}`);
    await page.emulateMedia({ media: null });
  });
});
