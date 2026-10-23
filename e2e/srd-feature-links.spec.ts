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

  // A class feature's link names the feature's own row (VEG-618), which the
  // class page renders inside the class card under the header and above the
  // subclasses. The fragment resolves against a loading page here too.
  test('a class feature hit scrolls to its row on the class page', async ({ page }) => {
    // Mystic Arcanum, not Pact Magic. Pact Magic is a level 1 Warlock row, so
    // it sits just under the proficiencies and can already be on screen at
    // scroll 0. The level 11 Mystic Arcanum follows seven rows, Eldritch
    // Invocations and its option list among them, so it sits below the fold.
    await searchFeatures(page, 'class', 'Mystic Arcanum');

    // The Warlock lists Mystic Arcanum at 11, 13, 15 and 17. The hit's subtitle
    // ("Class: Warlock · Level 11") is part of the button's name, so this picks
    // the level 11 row.
    const hit = page.getByRole('button', { name: /^Mystic Arcanum.*\bLevel 11\b/ }).first();
    await expect(hit).toBeVisible({ timeout: 10_000 });
    await hit.click();

    await page.getByRole('link', { name: /^Open .+ Class →$/ }).click();

    await expect(page).toHaveURL(/\/srd\/classes\/[^/#]+#.+$/);
    const fragment = new URL(page.url()).hash.slice(1);
    expect(fragment, 'the link carried no feature fragment').not.toBe('');

    const row = page.locator(`[id="${fragment}"]`);
    await expect(row).toBeInViewport({ timeout: 10_000 });
    await expect(row).toContainText('Mystic Arcanum');
    await expect(row).toContainText('Level 11');
    // The row being on screen only proves the page scrolled if the page moved.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });

  test("the class page shows a feature's text without a click", async ({ page }) => {
    const list = await page.request.get(`${BACKEND}/api/srd/classes`);
    expect(list.ok(), `classes list failed: ${list.status()}`).toBeTruthy();
    const classes = (await list.json()) as { id: string; name: string }[];
    const warlock = classes.find(c => c.name === 'Warlock');
    expect(warlock, 'Warlock is not seeded').toBeDefined();

    // Read the prose off the API, so a reworded seed description cannot break
    // the test.
    const detail = await page.request.get(`${BACKEND}/api/srd/classes/${warlock!.id}`);
    expect(detail.ok(), `Warlock detail failed: ${detail.status()}`).toBeTruthy();
    const { features } = (await detail.json()) as {
      features: { id: string; name: string; description: string }[];
    };
    const pactMagic = features.find(f => f.name === 'Pact Magic');
    expect(pactMagic, 'Warlock has no Pact Magic feature').toBeDefined();

    await page.goto(`/srd/classes/${warlock!.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Warlock' })).toBeVisible({
      timeout: 10_000,
    });

    // The description is markdown split into paragraphs, so the check reads the
    // row by its id and looks for the first sentence, which no paragraph break
    // can split.
    const firstSentence = pactMagic!.description.split('. ')[0];
    const row = page.locator(`[id="${pactMagic!.id}"]`);
    await expect(row).toBeVisible();
    await expect(row).toContainText(firstSentence);
  });

  test("the class page folds a feature's options into a group", async ({ page }) => {
    const list = await page.request.get(`${BACKEND}/api/srd/classes`);
    expect(list.ok(), `classes list failed: ${list.status()}`).toBeTruthy();
    const classes = (await list.json()) as { id: string; name: string }[];
    const warlock = classes.find(c => c.name === 'Warlock');
    expect(warlock, 'Warlock is not seeded').toBeDefined();

    const detail = await page.request.get(`${BACKEND}/api/srd/classes/${warlock!.id}`);
    expect(detail.ok(), `Warlock detail failed: ${detail.status()}`).toBeTruthy();
    const { features } = (await detail.json()) as { features: { id: string; name: string }[] };
    const invocations = features.find(f => f.name === 'Eldritch Invocations');
    expect(invocations, 'Warlock has no Eldritch Invocations feature').toBeDefined();

    await page.goto(`/srd/classes/${warlock!.id}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Warlock' })).toBeVisible({
      timeout: 10_000,
    });

    const row = page.locator(`[id="${invocations!.id}"]`);
    const toggle = row.getByRole('button', { name: /^Show \d+ options$/ });
    await expect(toggle).toBeVisible();
    await expect(row.getByText('Agonizing Blast')).toHaveCount(0);

    await toggle.click();

    await expect(row.getByText('Agonizing Blast')).toBeVisible();
    await expect(row.getByText(/^Prerequisite:/).first()).toBeVisible();
    await expect(row.getByRole('button', { name: 'Hide options' })).toBeVisible();

    // The open list must wrap on a phone rather than widen the page.
    await page.setViewportSize({ width: 375, height: 800 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
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

    await page.getByRole('link', { name: 'Open race page (Dragonborn)' }).click();

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

    await page.getByRole('link', { name: 'Open background page (Acolyte)' }).click();

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
