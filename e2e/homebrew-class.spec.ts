import { expect, test, type Page } from '@playwright/test';
import { BACKEND, csrfHeaders, escapeRegExp, registerAndLogin } from './helpers';

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
    await page.getByRole('link', { name: 'Open class page', exact: true }).click();
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
    expect(saved.features[0]).toMatchObject({ name: featureName, level: 1 });
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
    await page.getByPlaceholder('Search spells, feats, items, and features...').fill(featureName);

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
    await expect(page.getByText('Failed to load class.', { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByLabel(/^Name/)).toHaveCount(0);
  });
});
