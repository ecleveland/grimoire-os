import { expect, test, type Page } from '@playwright/test';
import { BACKEND } from './helpers';

const SEARCH_PLACEHOLDER = 'Search spells, feats, items, classes, and features...';

// The four kinds switched on alongside Features. Clicking each leaves Features
// as the only kind, so a spell or item sharing the query cannot stand in for
// the feature hit.
const OTHER_KINDS = ['Spells', 'Feats', 'Items', 'Classes'];

// Every page here is under the public /srd prefix and every request is an
// anonymous SRD GET, so these run logged out (srd-print-anonymous.spec.ts is
// the precedent). A visitor meeting the catalog for the first time is also the
// likeliest one to follow a search hit.
async function searchFeatures(page: Page, parentType: string, query: string) {
  await page.goto('/srd/search');
  for (const kind of OTHER_KINDS) {
    await page.getByRole('button', { name: kind, exact: true }).click();
  }
  await page.getByLabel('Parent Type').selectOption(parentType);
  await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(query);
}

test.describe('Feature search links (VEG-558)', () => {
  test('a race trait hit opens the race page it names', async ({ page }) => {
    // Narrowed to race traits, so the first Darkvision hit cannot be a class
    // feature or a background feature of the same name.
    await searchFeatures(page, 'race', 'Darkvision');

    // Anchored, so the card's print toggle ("Add Darkvision to print set")
    // cannot match. Several races grant Darkvision; any of them proves the link.
    const hit = page.getByRole('button', { name: /^Darkvision/ }).first();
    await expect(hit).toBeVisible({ timeout: 10_000 });
    await hit.click();

    const drilldown = page.getByRole('link', { name: /^Open .+ Race →$/ });
    await expect(drilldown).toBeVisible();
    const raceName = (await drilldown.innerText())
      .replace(/^Open\s+/, '')
      .replace(/\s+Race\s+→$/, '')
      .trim();
    expect(raceName, 'could not read the race name off the link').not.toBe('');

    await drilldown.click();

    await expect(page).toHaveURL(/\/srd\/races\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1, name: raceName })).toBeVisible({
      timeout: 10_000,
    });
  });

  // A subclass has no page of its own, so its link is a fragment on the class
  // page. The class is fetched after the navigation, so the browser resolves
  // that fragment against a loading page: without the section's own scroll the
  // reader lands at the top of a long class page and has to hunt for the card.
  test('a subclass feature hit scrolls to its card on the class page', async ({ page }) => {
    // Arcane Charge belongs to Eldritch Knight, the second of the Fighter's two
    // subclasses, so its card sits well below the fold. A hit whose card was
    // already on screen would pass this test without scrolling at all.
    await searchFeatures(page, 'subclass', 'Arcane Charge');

    const hit = page.getByRole('button', { name: /^Arcane Charge/ }).first();
    await expect(hit).toBeVisible({ timeout: 10_000 });
    await hit.click();

    await page.getByRole('link', { name: /^Open .+ Subclass →$/ }).click();

    await expect(page).toHaveURL(/\/srd\/classes\/[^/#]+#.+$/);
    const fragment = new URL(page.url()).hash.slice(1);
    expect(fragment, 'the link carried no subclass fragment').not.toBe('');

    const card = page.locator(`[id="${fragment}"]`);
    await expect(card).toBeInViewport({ timeout: 10_000 });
    // The card being on screen only proves the page scrolled if the page moved.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  // Seeded backgrounds carry no feature rows and the create DTO rejects
  // features, so no search hit reaches a background page today. Visiting one
  // directly is the coverage until a background can own a feature.
  test('a background page renders by id', async ({ page }) => {
    const res = await page.request.get(`${BACKEND}/api/srd/backgrounds`);
    expect(res.ok(), `backgrounds list failed: ${res.status()}`).toBeTruthy();
    const rows = (await res.json()) as { id: string; name: string }[];
    expect(rows.length, 'no seeded backgrounds to open').toBeGreaterThan(0);

    await page.goto(`/srd/backgrounds/${rows[0].id}`);

    await expect(page.getByRole('heading', { level: 1, name: rows[0].name })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('link', { name: '← Backgrounds' })).toBeVisible();
  });

  test('a race list card opens the race page', async ({ page }) => {
    await page.goto('/srd/races');

    // Anchored, so the card's print toggle ("Add Dragonborn to print set") cannot match.
    const card = page.getByRole('button', { name: /^Dragonborn/ });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await page.getByRole('link', { name: 'Open Dragonborn race page' }).click();

    await expect(page).toHaveURL(/\/srd\/races\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1, name: /^Dragonborn/ })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('a background list card opens the background page', async ({ page }) => {
    await page.goto('/srd/backgrounds');
    // The list is fetched client-side, so wait for the page before hunting a card.
    await expect(page.getByRole('heading', { name: 'Backgrounds' })).toBeVisible({
      timeout: 10_000,
    });

    const card = page.getByRole('button', { name: /^Acolyte/ });
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click();

    await page.getByRole('link', { name: 'Open Acolyte background page' }).click();

    await expect(page).toHaveURL(/\/srd\/backgrounds\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1, name: /^Acolyte/ })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('an unknown race or background id says so instead of erroring', async ({ page }) => {
    await page.goto('/srd/races/does-not-exist');
    await expect(page.getByText('Race not found.')).toBeVisible({ timeout: 10_000 });

    await page.goto('/srd/backgrounds/does-not-exist');
    await expect(page.getByText('Background not found.')).toBeVisible({ timeout: 10_000 });
  });
});
