import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, escapeRegExp, registerAndLogin } from './helpers';

/** Literal-match regex for names carrying regex metacharacters (e.g. "(Exhumed)"). */
function exact(text: string): RegExp {
  return new RegExp(escapeRegExp(text));
}

// Golden path for homebrew backgrounds (VEG-431): create one via the form —
// relating it to an SRD origin feat — see it flagged in the list, edit it,
// then delete it. SRD rows stay immutable throughout (the API enforces it;
// the UI never offers Edit/Delete on them).
test.describe('Custom backgrounds (VEG-431)', () => {
  test('user creates, edits, and deletes a homebrew background with an origin feat', async ({
    page,
  }) => {
    await registerAndLogin(page, 'bg', 'E2E Background Brewer');

    const name = `Gravedigger ${Date.now()}`;

    // ── Create via the form, relating an SRD origin feat ──────────────────
    await page.goto('/srd/backgrounds');
    await page.getByRole('link', { name: /create background/i }).click();
    await expect(page.getByRole('heading', { name: /create background/i })).toBeVisible();

    await page.getByLabel(/^Name/).fill(name);
    await page.getByLabel(/^Description/).fill('You spent years tending the resting places.');
    await page.getByLabel(/Skill proficiencies/).fill('Insight\nReligion');
    await page.getByLabel(/^Origin feat$/).click();
    await page.getByLabel(/^Origin feat$/).fill('Alert');
    await page.getByRole('option', { name: 'Alert' }).click();

    await page.getByRole('button', { name: 'Create background' }).click();

    // ── Appears in the list, flagged as homebrew, showing the feat link ────
    await expect(page).toHaveURL(/\/srd\/backgrounds$/);
    const summary = page.getByRole('button', { name: exact(name) }).first();
    await expect(summary).toBeVisible({ timeout: 10_000 });
    await expect(summary.getByText('Homebrew', { exact: true })).toBeVisible();
    await expect(summary.getByText(/Feat: Alert/)).toBeVisible();

    // ── Expand: owner actions present ──────────────────────────────────────
    await summary.click();
    await expect(page.getByRole('link', { name: /edit/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Delete$/i })).toBeVisible();

    // ── Edit it ────────────────────────────────────────────────────────────
    await page.getByRole('link', { name: /edit/i }).click();
    await expect(page.getByRole('heading', { name: /edit background/i })).toBeVisible();
    await expect(page.getByLabel(/^Name/)).toHaveValue(name);
    await expect(page.getByLabel(/^Origin feat$/)).toHaveValue('Alert');

    const editedName = `${name} (Exhumed)`;
    await page.getByLabel(/^Name/).fill(editedName);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/srd\/backgrounds$/);
    const editedSummary = page.getByRole('button', { name: exact(editedName) }).first();
    await expect(editedSummary).toBeVisible({ timeout: 10_000 });

    // ── Delete it ──────────────────────────────────────────────────────────
    await editedSummary.click();
    await page.getByRole('button', { name: /^Delete$/i }).click();
    await page.getByRole('button', { name: /^Delete background$/i }).click();

    await expect(page.getByRole('button', { name: exact(editedName) })).toHaveCount(0, {
      timeout: 10_000,
    });
  });

  test('a homebrew background can relate to a self-authored homebrew feat and appears in the builder picker', async ({
    page,
  }) => {
    await registerAndLogin(page, 'bg-feat', 'E2E Necromancer');
    const stamp = Date.now();
    const headers = await csrfHeaders(page);

    // Author a homebrew feat, then a homebrew background linked to it (API —
    // the form path is covered above).
    const featName = `Corpse Whisperer ${stamp}`;
    const feat = await page.request.post(`${BACKEND}/api/srd/feats`, {
      data: { name: featName, description: 'The dead speak to you.' },
      headers,
    });
    expect(feat.ok(), `feat create failed: ${feat.status()}`).toBeTruthy();
    const featId = (await feat.json()).id as string;

    const bgName = `Mortician ${stamp}`;
    const bg = await page.request.post(`${BACKEND}/api/srd/backgrounds`, {
      data: {
        name: bgName,
        skillProficiencies: ['Medicine'],
        originFeatId: featId,
      },
      headers,
    });
    expect(bg.ok(), `background create failed: ${bg.status()}`).toBeTruthy();

    // The list shows the homebrew feat as the origin.
    await page.goto('/srd/backgrounds');
    const summary = page.getByRole('button', { name: exact(bgName) }).first();
    await expect(summary).toBeVisible({ timeout: 10_000 });
    await expect(summary.getByText(exact(`Feat: ${featName}`))).toBeVisible();

    // The guided builder's background picker (Origin step, after Class) offers
    // it and grants the origin feat.
    await page.goto('/characters/new/guided');
    await expect(page.getByRole('heading', { name: /guided character build/i })).toBeVisible();
    const classInput = page.getByRole('combobox', { name: /^class/i });
    await classInput.click();
    await classInput.fill('Fighter');
    await page.getByRole('option', { name: 'Fighter' }).click();
    const skillChips = page.getByRole('group', { name: /skills/i }).getByRole('button');
    await skillChips.nth(0).click();
    await skillChips.nth(1).click();
    await page.getByRole('button', { name: /^next$/i }).click(); // → Origin

    const bgPicker = page.getByRole('combobox', { name: /background/i });
    await bgPicker.fill(bgName);
    await page.getByRole('option', { name: bgName }).click();
    const grants = page.getByRole('group', { name: /background grants/i });
    await expect(grants).toContainText(featName);
  });

  test('a homebrew background may reuse an SRD name (per-tier partial unique indexes)', async ({
    page,
  }) => {
    // The migration's core promise: the global name unique is gone, replaced by
    // per-source partial indexes — so a user's own "Acolyte" must coexist with
    // the SRD row. Only a real database proves the indexes; unit specs mock Prisma.
    await registerAndLogin(page, 'bg-reuse', 'E2E Name Reuser');
    const headers = await csrfHeaders(page);

    const create = await page.request.post(`${BACKEND}/api/srd/backgrounds`, {
      data: { name: 'Acolyte', skillProficiencies: ['Stealth'] },
      headers,
    });
    expect(create.status(), await create.text()).toBe(201);

    // Both rows ride the owner's list: the SRD Acolyte and the homebrew one.
    const list = await page.request.get(`${BACKEND}/api/srd/backgrounds`);
    const acolytes = ((await list.json()) as { name: string; contentSource: string }[]).filter(
      b => b.name === 'Acolyte'
    );
    expect(acolytes.map(a => a.contentSource).sort()).toEqual(['homebrew', 'srd']);

    // A second homebrew row with the same name (same owner) is the case the
    // per-owner partial index rejects: 409, not a silent overwrite.
    const dup = await page.request.post(`${BACKEND}/api/srd/backgrounds`, {
      data: { name: 'Acolyte' },
      headers,
    });
    expect(dup.status()).toBe(409);
  });

  test("another user's homebrew background is invisible and immutable to them", async ({
    page,
  }) => {
    // User A creates a homebrew background via the API.
    await registerAndLogin(page, 'bg-a', 'E2E Background Owner');
    const name = `Tomb Warden ${Date.now()}`;
    const create = await page.request.post(`${BACKEND}/api/srd/backgrounds`, {
      data: {
        name,
        description: 'You guarded the barrows of forgotten kings.',
        skillProficiencies: ['History'],
      },
      headers: await csrfHeaders(page),
    });
    expect(create.ok(), `background create failed: ${create.status()}`).toBeTruthy();
    const backgroundId = (await create.json()).id as string;

    // User B logs in (replaces the session cookies).
    await registerAndLogin(page, 'bg-b', 'E2E Background Stranger');

    // (a) A's homebrew never appears in B's browse list.
    await page.goto('/srd/backgrounds');
    await expect(page.getByRole('heading', { name: 'Backgrounds' })).toBeVisible();
    await expect(page.getByText('Acolyte').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: exact(name) })).toHaveCount(0);

    // (b) The detail endpoint resolves empty for B — no existence leak.
    const detail = await page.request.get(`${BACKEND}/api/srd/backgrounds/${backgroundId}`);
    expect(detail.status()).toBe(200);
    expect(await detail.text()).not.toContain(name);

    // (c) B cannot mutate it: writes 404 (not 403 — existence must not leak).
    const headers = await csrfHeaders(page);
    const patch = await page.request.patch(`${BACKEND}/api/srd/backgrounds/${backgroundId}`, {
      data: { name: 'Stolen Barrow' },
      headers,
    });
    expect(patch.status()).toBe(404);
    const del = await page.request.delete(`${BACKEND}/api/srd/backgrounds/${backgroundId}`, {
      headers,
    });
    expect(del.status()).toBe(404);

    // (d) SRD rows are immutable to everyone — no SRD row is ever modified.
    const srdList = await page.request.get(`${BACKEND}/api/srd/backgrounds`);
    const acolyte = ((await srdList.json()) as { id: string; name: string }[]).find(
      b => b.name === 'Acolyte'
    );
    expect(acolyte).toBeTruthy();
    const srdPatch = await page.request.patch(`${BACKEND}/api/srd/backgrounds/${acolyte!.id}`, {
      data: { name: 'Defiled Acolyte' },
      headers,
    });
    expect(srdPatch.status()).toBe(403);
  });
});
