import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { BACKEND, csrfHeaders, escapeRegExp, registerAndLogin } from './helpers';

/** The unified search box, which names every kind it covers. */
const SEARCH_PLACEHOLDER = 'Search spells, feats, items, classes, and features...';

/** How many classes the given request context can see under this name. */
async function classSearchTotal(request: APIRequestContext, name: string): Promise<number> {
  const res = await request.get(
    `${BACKEND}/api/srd/search?types=class&q=${encodeURIComponent(name)}`
  );
  expect(res.ok(), `search failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).total as number;
}

/** Literal-match regex for names carrying regex metacharacters (e.g. "(Revised)"). */
function exact(text: string): RegExp {
  return new RegExp(escapeRegExp(text));
}

// The multiclassing rules the class form names in its note but never edits.
// Same shape `custom-class.spec.ts` sends.
const MULTICLASSING = {
  prerequisites: [{ ability: 'Strength', minimum: 13 }],
  proficienciesGained: ['Light armor'],
  casterType: null,
};

/** Creates a homebrew class through the API as the logged-in user and returns its id. */
async function createClass(page: Page, data: Record<string, unknown>): Promise<string> {
  const res = await page.request.post(`${BACKEND}/api/srd/classes`, {
    data,
    headers: await csrfHeaders(page),
  });
  expect(res.ok(), `class create failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).id as string;
}

/** A chip inside one ToggleChips group. Both ability groups have a Strength chip. */
function chip(page: Page, group: string, option: string) {
  return page
    .getByRole('group', { name: group, exact: true })
    .getByRole('button', { name: option, exact: true });
}

// UI golden path for homebrew classes: the class form, the class detail page,
// and the search link into it. `custom-class.spec.ts` drives the same writes
// through the API, where the server-side rules are asserted.
test.describe('Homebrew class pages (VEG-508)', () => {
  test('user creates, views, edits, and deletes a homebrew class through the UI', async ({
    page,
  }) => {
    await registerAndLogin(page, 'class-ui', 'E2E Class Brewer');
    const stamp = Date.now();
    const name = `Warden ${stamp}`;
    const featureName = `Wardens Bond ${stamp}`;

    // ── Create through the form ────────────────────────────────────────────
    await page.goto('/srd/classes');
    await page.getByRole('link', { name: /create class/i }).click();
    await expect(page.getByRole('heading', { name: 'Create Class', exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel(/^Name/).fill(name);
    await page.getByLabel('Hit die', { exact: true }).selectOption('d10');
    await chip(page, 'Primary abilities', 'Strength').click();
    await chip(page, 'Saving throws', 'Strength').click();
    await chip(page, 'Saving throws', 'Constitution').click();
    await chip(page, 'Skill choices', 'Athletics').click();
    await chip(page, 'Skill choices', 'Survival').click();
    await page.getByLabel('Number of skill choices', { exact: true }).fill('2');
    await page.getByRole('button', { name: '+ Add feature', exact: true }).click();
    await page.getByLabel('Feature name', { exact: true }).fill(featureName);
    await page.getByRole('button', { name: 'Create class', exact: true }).click();

    // ── Listed and flagged as homebrew ─────────────────────────────────────
    await expect(page).toHaveURL(/\/srd\/classes$/);
    const summary = page.getByRole('button', { name: exact(name) }).first();
    await expect(summary).toBeVisible({ timeout: 10_000 });
    await expect(summary.getByText('Homebrew', { exact: true })).toBeVisible();

    // ── Detail page ────────────────────────────────────────────────────────
    await summary.click();
    await page
      .getByRole('link', { name: `Open class page (${name}, homebrew)`, exact: true })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: exact(name) })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(featureName).first()).toBeVisible();

    // ── Edit from the detail page ──────────────────────────────────────────
    await page.getByRole('link', { name: 'Edit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit Class', exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/^Name/)).toHaveValue(name);

    const renamed = `${name} (Revised)`;
    await page.getByLabel(/^Name/).fill(renamed);
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();

    // ── Delete from the list ───────────────────────────────────────────────
    await expect(page).toHaveURL(/\/srd\/classes$/);
    const renamedSummary = page.getByRole('button', { name: exact(renamed) }).first();
    await expect(renamedSummary).toBeVisible({ timeout: 10_000 });
    await renamedSummary.click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete class', exact: true }).click();

    await expect(page.getByRole('button', { name: exact(renamed) })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test('saving the form keeps the rules it does not edit', async ({ page }) => {
    await registerAndLogin(page, 'class-rules', 'E2E Rules Keeper');
    const stamp = Date.now();
    const featureName = `Wardens Bond ${stamp}`;
    const id = await createClass(page, {
      name: `Warden ${stamp}`,
      hitDie: 'd10',
      description: 'A sworn protector of wild places.',
      features: [{ name: featureName, level: 1, description: 'A sworn bond.' }],
      multiclassing: MULTICLASSING,
    });

    const before = await page.request.get(`${BACKEND}/api/srd/classes/${id}`);
    expect(before.ok(), `class read failed: ${before.status()}`).toBeTruthy();
    const featureId = ((await before.json()).features as { id: string }[])[0].id;

    await page.goto(`/srd/classes/${id}/edit`);
    await expect(page.getByText(/^This class also has multiclassing rules\./)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByLabel('Description', { exact: true }).fill('Rewritten through the form.');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page).toHaveURL(/\/srd\/classes$/, { timeout: 10_000 });

    const detail = await page.request.get(`${BACKEND}/api/srd/classes/${id}`);
    expect(detail.ok(), `class read failed: ${detail.status()}`).toBeTruthy();
    const saved = await detail.json();
    expect(saved.multiclassing).toEqual(MULTICLASSING);
    expect(saved.description).toBe('Rewritten through the form.');
    expect(saved.features).toHaveLength(1);
    // The same id proves the save left the feature rows alone instead of replacing them.
    expect(saved.features[0]).toMatchObject({ id: featureId, name: featureName, level: 1 });
    // The column's default count survives the save, even against an empty pool.
    expect(saved.numSkillChoices).toBe(2);
    expect(saved.skillChoices).toEqual([]);
  });

  test('a feature search result opens its class page', async ({ page }) => {
    await registerAndLogin(page, 'class-search', 'E2E Class Seeker');
    const stamp = Date.now();
    const className = `Warden ${stamp}`;
    const featureName = `Grove Step ${stamp}`;
    const id = await createClass(page, {
      name: className,
      hitDie: 'd10',
      features: [{ name: featureName, level: 2, description: 'Step between two trees.' }],
    });

    // Leave only Features switched on, the way srd-print.spec.ts leaves only Spells.
    await page.goto('/srd/search');
    await page.getByRole('button', { name: 'Spells', exact: true }).click();
    await page.getByRole('button', { name: 'Feats', exact: true }).click();
    await page.getByRole('button', { name: 'Items', exact: true }).click();
    await page.getByRole('button', { name: 'Classes', exact: true }).click();
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(featureName);

    // Anchored, so the result's print toggle ("Add ... to print set") can't match.
    const result = page.getByRole('button', {
      name: new RegExp(`^${escapeRegExp(featureName)}`),
    });
    await expect(result).toBeVisible({ timeout: 10_000 });
    await result.click();
    await page.getByRole('link', { name: `Open ${className} Class →`, exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`/srd/classes/${id}$`));
    await expect(page.getByRole('heading', { level: 1, name: exact(className) })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('a homebrew class is found by the Classes search kind, and not by anyone else [VEG-510]', async ({
    page,
    browser,
  }) => {
    await registerAndLogin(page, 'class-kind', 'E2E Class Namer');
    const stamp = Date.now();
    const className = `Warden ${stamp}`;
    const id = await createClass(page, {
      name: className,
      hitDie: 'd10',
      description: 'A sworn protector of wild places.',
    });

    // Leave only Classes switched on, so a spell or feature sharing the stamp
    // can't stand in for the class hit.
    await page.goto('/srd/search');
    for (const kind of ['Spells', 'Feats', 'Items', 'Features']) {
      await page.getByRole('button', { name: kind, exact: true }).click();
    }
    await page.getByPlaceholder(SEARCH_PLACEHOLDER).fill(className);

    const heading = page.getByRole('heading', { level: 2, name: exact(className) });
    await expect(heading).toHaveCount(1, { timeout: 10_000 });
    await expect(heading.getByText('Homebrew', { exact: true })).toBeVisible();

    // Anchored, so the surrounding card's other controls can't match.
    await page.getByRole('button', { name: new RegExp(`^${escapeRegExp(className)}`) }).click();
    await page.getByRole('link', { name: `Open ${className} Class →`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/srd/classes/${id}$`));

    // Homebrew is a per-user library: nobody else sees it, signed in or not.
    const anon = await browser.newContext();
    try {
      expect(await classSearchTotal(anon.request, className)).toBe(0);
    } finally {
      await anon.close();
    }

    const strangerContext = await browser.newContext();
    try {
      const strangerPage = await strangerContext.newPage();
      await registerAndLogin(strangerPage, 'class-kind-stranger', 'E2E Class Stranger');
      expect(await classSearchTotal(strangerPage.request, className)).toBe(0);
    } finally {
      await strangerContext.close();
    }
  });

  test('a homebrew class feature prints from its own class page [VEG-510]', async ({ page }) => {
    await registerAndLogin(page, 'class-print', 'E2E Class Printer');
    const stamp = Date.now();
    const className = `Warden ${stamp}`;
    const featureName = `Grove Step ${stamp}`;
    const id = await createClass(page, {
      name: className,
      hitDie: 'd10',
      features: [{ name: featureName, level: 1, description: 'Printed.' }],
    });

    // A class is not printable, but its features are, and the chips are on the
    // class page rather than on the search result.
    await page.goto(`/srd/classes/${id}`);
    const addFeature = page.getByRole('button', { name: `Add ${featureName} to print set` });
    await expect(addFeature).toBeVisible({ timeout: 10_000 });
    await addFeature.click();
    await expect(page.getByRole('link', { name: 'Print (1)' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('link', { name: 'Print (1)' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('link', { name: 'Print (1)' }).click();
    await expect(page).toHaveURL('/srd/print');

    const groups = page.getByTestId('print-group');
    await expect(groups).toHaveCount(1, { timeout: 10_000 });
    await expect(groups.nth(0)).toHaveAttribute('data-card-type', 'feature');

    const featureCard = page.locator('[data-card-type="feature"] [data-testid="print-card"]');
    await expect(featureCard).toHaveCount(1);
    await expect(featureCard).toContainText(featureName);
    await expect(featureCard.locator('header')).toContainText(`Class · ${className}`);
  });

  test("a stranger can't reach another user's class pages", async ({ page }) => {
    await registerAndLogin(page, 'class-owner-ui', 'E2E Class Owner');
    const id = await createClass(page, { name: `Private Warden ${Date.now()}`, hitDie: 'd10' });

    // User B logs in, which replaces the session cookies.
    await registerAndLogin(page, 'class-stranger-ui', 'E2E Class Stranger');

    await page.goto(`/srd/classes/${id}`);
    await expect(page.getByText('Class not found.', { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await page.goto(`/srd/classes/${id}/edit`);
    await expect(page).toHaveURL(new RegExp(`/srd/classes/${id}/edit$`));
    await expect(page.getByText('Class not found.', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/^Name/)).toHaveCount(0);
  });
});
