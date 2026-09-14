import { expect, test, type Page } from '@playwright/test';
import { BACKEND, csrfHeaders, escapeRegExp, registerAndLogin } from './helpers';

/** Literal-match regex for names carrying regex metacharacters. */
function exact(text: string): RegExp {
  return new RegExp(escapeRegExp(text));
}

/** The id of the seeded SRD Fighter, which every user can see. */
async function srdFighterId(page: Page): Promise<string> {
  const res = await page.request.get(`${BACKEND}/api/srd/classes`);
  expect(res.ok(), `class list failed: ${res.status()}`).toBeTruthy();
  const classes = (await res.json()) as { id: string; name: string; contentSource: string }[];
  const fighter = classes.find(c => c.name === 'Fighter' && c.contentSource === 'srd');
  expect(fighter, 'seeded SRD Fighter missing').toBeTruthy();
  return fighter!.id;
}

// UI golden path for homebrew subclasses (VEG-509): the inline editor on the
// class page, and the subclass carrying through to a character sheet. The API
// matrix below covers the scoping rules the UI can't reach.
test.describe('Homebrew subclasses (VEG-509)', () => {
  test('user adds, edits, uses, and deletes a subclass on an SRD class', async ({ page }) => {
    await registerAndLogin(page, 'subclass-ui', 'E2E Subclass Brewer');
    const stamp = Date.now();
    const name = `Deadeye ${stamp}`;
    const featureName = `Steady Aim ${stamp}`;

    // ── Create inline on the class page ────────────────────────────────────
    const fighterId = await srdFighterId(page);
    await page.goto(`/srd/classes/${fighterId}`);
    await expect(page.getByRole('heading', { level: 1, name: /Fighter/ })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole('button', { name: 'Add subclass', exact: true }).click();
    await page.getByLabel(/^Name/).fill(name);
    await page.getByRole('button', { name: '+ Add feature', exact: true }).click();
    await page.getByLabel('Feature name', { exact: true }).fill(featureName);
    await page.getByRole('button', { name: 'Create subclass', exact: true }).click();

    const card = page
      .getByRole('heading', { level: 3, name: exact(name) })
      .locator('xpath=ancestor::li[1]');
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText('Homebrew', { exact: true })).toBeVisible();
    await expect(card.getByText(featureName)).toBeVisible();

    // ── Edit it in place ───────────────────────────────────────────────────
    await card.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByLabel(/^Name/)).toHaveValue(name);
    await page.getByLabel('Description', { exact: true }).fill('A patient marksman.');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByText('A patient marksman.', { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // ── Pick it on a new character ─────────────────────────────────────────
    await page.goto('/characters/new');
    await page.getByLabel(/^name/i).fill(`Sharpshooter ${stamp}`);

    // Scoped to the combobox's listbox: a page-wide option query also matches the
    // native selects that are always in the DOM (VEG-505).
    const classInput = page.getByLabel(/^class/i);
    await classInput.click();
    await page.getByRole('listbox').getByRole('option', { name: 'Fighter', exact: true }).click();
    await expect(classInput).toHaveValue('Fighter');

    const subclassInput = page.getByLabel(/^subclass/i);
    await subclassInput.click();
    await page
      .getByRole('listbox')
      .getByRole('option', { name: exact(name) })
      .click();
    await expect(subclassInput).toHaveValue(name);

    await page.getByRole('button', { name: /create character/i }).click();
    await expect(page.getByRole('heading', { name: `Sharpshooter ${stamp}` })).toBeVisible({
      timeout: 10_000,
    });

    // A reload proves the pick was persisted, not just held in form state.
    await page.reload();
    await expect(page.getByTestId('field-subclass')).toContainText(name, { timeout: 10_000 });

    // ── Delete it from the class page ──────────────────────────────────────
    await page.goto(`/srd/classes/${fighterId}`);
    const savedCard = page
      .getByRole('heading', { level: 3, name: exact(name) })
      .locator('xpath=ancestor::li[1]');
    await expect(savedCard).toBeVisible({ timeout: 10_000 });
    await savedCard.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete subclass', exact: true }).click();

    await expect(page.getByRole('heading', { level: 3, name: exact(name) })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test("a stranger can't see or touch another user's subclass", async ({ page, browser }) => {
    await registerAndLogin(page, 'subclass-owner', 'E2E Subclass Owner');
    const headers = await csrfHeaders(page);
    const stamp = Date.now();

    const classRes = await page.request.post(`${BACKEND}/api/srd/classes`, {
      data: { name: `Gunslinger ${stamp}`, hitDie: 'd8' },
      headers,
    });
    expect(classRes.ok(), `class create failed: ${classRes.status()}`).toBeTruthy();
    const classId = (await classRes.json()).id as string;

    const subRes = await page.request.post(`${BACKEND}/api/srd/subclasses`, {
      data: { name: `Deadeye ${stamp}`, classId, description: 'A patient marksman.' },
      headers,
    });
    expect(subRes.ok(), `subclass create failed: ${subRes.status()}`).toBeTruthy();
    const subclassId = (await subRes.json()).id as string;

    // A second, unrelated user.
    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await registerAndLogin(strangerPage, 'subclass-stranger', 'E2E Subclass Stranger');
    const strangerHeaders = await csrfHeaders(strangerPage);
    const NEVER_EXISTED = '00000000-0000-4000-8000-000000000000';

    // Creating under an invisible parent must answer exactly as creating under an
    // id that never existed, or the pair is an existence oracle for the class.
    const underInvisible = await strangerPage.request.post(`${BACKEND}/api/srd/subclasses`, {
      data: { name: `Poacher ${stamp}`, classId },
      headers: strangerHeaders,
    });
    const underNothing = await strangerPage.request.post(`${BACKEND}/api/srd/subclasses`, {
      data: { name: `Poacher ${stamp}`, classId: NEVER_EXISTED },
      headers: strangerHeaders,
    });
    expect(underInvisible.status()).toBe(underNothing.status());
    // Compared field by field rather than as text: the error body carries a
    // timestamp, so two refusals milliseconds apart never match byte for byte.
    const invisibleBody = await underInvisible.json();
    const nothingBody = await underNothing.json();
    expect(invisibleBody.statusCode).toBe(nothingBody.statusCode);
    expect(invisibleBody.message).toBe(nothingBody.message);
    expect(invisibleBody.error).toBe(nothingBody.error);

    // Same property on the read.
    const invisible = await strangerPage.request.get(`${BACKEND}/api/srd/subclasses/${subclassId}`);
    const neverExisted = await strangerPage.request.get(
      `${BACKEND}/api/srd/subclasses/${NEVER_EXISTED}`
    );
    expect(invisible.status()).toBe(neverExisted.status());
    expect(await invisible.text()).toBe(await neverExisted.text());

    const patch = await strangerPage.request.patch(`${BACKEND}/api/srd/subclasses/${subclassId}`, {
      data: { description: 'Mine now.' },
      headers: strangerHeaders,
    });
    expect(patch.status()).toBe(404);

    const del = await strangerPage.request.delete(`${BACKEND}/api/srd/subclasses/${subclassId}`, {
      headers: strangerHeaders,
    });
    expect(del.status()).toBe(404);

    await stranger.close();

    // A subclass never moves between classes, so the owner can't reparent it either.
    const reparent = await page.request.patch(`${BACKEND}/api/srd/subclasses/${subclassId}`, {
      data: { classId: NEVER_EXISTED },
      headers,
    });
    expect(reparent.status()).toBe(400);
  });
});
