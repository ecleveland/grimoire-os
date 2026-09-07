import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// Golden path for homebrew classes (VEG-506, extended by VEG-507), driven
// through the API rather than the UI: the class pages arrive in VEG-508, so
// there is no form to fill yet.
//
// What this covers that the unit suites cannot. The partial unique indexes are
// proved against a real database in `class-content-source.db-spec.ts` (VEG-505),
// and the P2002 -> 409 mapping is proved against a Prisma mock in
// `content-write.contract.spec.ts` (VEG-336). Neither joins the two, so nothing
// showed that a real duplicate insert through the real service reaches the client
// as a clean 409 rather than a 500. Same for the subclass delete guard, where the
// ON DELETE RESTRICT constraint and the service's catch are tested apart.
test.describe('Custom classes (VEG-506)', () => {
  test('user creates, edits, and deletes a homebrew class', async ({ page }) => {
    await registerAndLogin(page, 'class', 'E2E Class Author');
    const headers = await csrfHeaders(page);
    const name = `Warden ${Date.now()}`;

    // ── Create ──────────────────────────────────────────────────────────────
    const created = await page.request.post(`${BACKEND}/api/srd/classes`, {
      data: {
        name,
        hitDie: 'd10',
        description: 'A sworn protector of wild places.',
        primaryAbilities: ['Strength'],
        savingThrows: ['Strength', 'Constitution'],
        skillChoices: ['Athletics', 'Survival'],
        numSkillChoices: 2,
        subclassLevel: 3,
        multiclassing: {
          prerequisites: [{ ability: 'Strength', minimum: 13 }],
          proficienciesGained: ['Light armor'],
          casterType: null,
        },
      },
      headers,
    });
    expect(created.ok(), `create failed: ${created.status()}`).toBeTruthy();
    const cls = await created.json();
    expect(cls).toMatchObject({ name, hitDie: 'd10', contentSource: 'homebrew' });
    // The tier and owner are stamped by the server, never taken from the body.
    expect(cls.source).toBe('Homebrew');

    // ── It rides along with the SRD catalog for its owner ───────────────────
    const list = await page.request.get(`${BACKEND}/api/srd/classes`);
    expect(list.ok()).toBeTruthy();
    const names = ((await list.json()) as { name: string }[]).map(c => c.name);
    expect(names).toContain(name);
    expect(names).toContain('Fighter'); // the SRD rows are still there

    // ── Edit ────────────────────────────────────────────────────────────────
    const patched = await page.request.patch(`${BACKEND}/api/srd/classes/${cls.id}`, {
      data: { description: 'Rewritten by its author.', numSkillChoices: 3 },
      headers,
    });
    expect(patched.ok(), `patch failed: ${patched.status()}`).toBeTruthy();
    expect(await patched.json()).toMatchObject({
      description: 'Rewritten by its author.',
      numSkillChoices: 3,
    });

    // ── A duplicate of the caller's own name is a clean 409, not a 500 ──────
    const duplicate = await page.request.post(`${BACKEND}/api/srd/classes`, {
      data: { name, hitDie: 'd8' },
      headers,
    });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).message).toMatch(/already have a class with this name/i);

    // ── An SRD name is still free to reuse ──────────────────────────────────
    const reusingSrdName = await page.request.post(`${BACKEND}/api/srd/classes`, {
      data: { name: 'Fighter', hitDie: 'd10' },
      headers,
    });
    expect(reusingSrdName.ok(), `SRD-name reuse failed: ${reusingSrdName.status()}`).toBeTruthy();

    // ── Delete ──────────────────────────────────────────────────────────────
    const deleted = await page.request.delete(`${BACKEND}/api/srd/classes/${cls.id}`, { headers });
    expect(deleted.status()).toBe(204);

    // The detail read resolves a deleted row to an empty body, not a 404. That is
    // the house style across every tiered entity (findClass, findBackground,
    // findFeat and the rest all return `findFirst(...)` straight through, and
    // Nest serializes null as 200). What matters for tiering is asserted in the
    // next test: gone and never-visible are indistinguishable.
    const gone = await page.request.get(`${BACKEND}/api/srd/classes/${cls.id}`);
    expect(await gone.text()).toBe('');
  });

  test("another user's homebrew class is invisible and unwritable", async ({ page, browser }) => {
    await registerAndLogin(page, 'class-owner', 'E2E Class Owner');
    const ownerHeaders = await csrfHeaders(page);
    const name = `Private Warden ${Date.now()}`;

    const created = await page.request.post(`${BACKEND}/api/srd/classes`, {
      data: { name, hitDie: 'd10' },
      headers: ownerHeaders,
    });
    expect(created.ok()).toBeTruthy();
    const id = (await created.json()).id as string;

    // A second, unrelated user.
    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await registerAndLogin(strangerPage, 'class-stranger', 'E2E Stranger');
    const strangerHeaders = await csrfHeaders(strangerPage);

    // Not in their catalog.
    const list = await strangerPage.request.get(`${BACKEND}/api/srd/classes`);
    const names = ((await list.json()) as { name: string }[]).map(c => c.name);
    expect(names).not.toContain(name);

    // The existence check that matters. A stranger's read of a real-but-invisible
    // class must be byte-identical to their read of an id that never existed —
    // same status, same body — or the pair is an existence oracle.
    const invisible = await strangerPage.request.get(`${BACKEND}/api/srd/classes/${id}`);
    const neverExisted = await strangerPage.request.get(
      `${BACKEND}/api/srd/classes/00000000-0000-4000-8000-000000000000`
    );
    expect(invisible.status()).toBe(neverExisted.status());
    expect(await invisible.text()).toBe(await neverExisted.text());

    const patch = await strangerPage.request.patch(`${BACKEND}/api/srd/classes/${id}`, {
      data: { description: 'Mine now.' },
      headers: strangerHeaders,
    });
    expect(patch.status()).toBe(404);

    const del = await strangerPage.request.delete(`${BACKEND}/api/srd/classes/${id}`, {
      headers: strangerHeaders,
    });
    expect(del.status()).toBe(404);

    await stranger.close();
  });

  test('an SRD class cannot be edited or deleted by anyone', async ({ page }) => {
    await registerAndLogin(page, 'class-srd', 'E2E SRD Prodder');
    const headers = await csrfHeaders(page);

    const list = await page.request.get(`${BACKEND}/api/srd/classes`);
    const fighter = ((await list.json()) as { id: string; name: string }[]).find(
      c => c.name === 'Fighter'
    );
    expect(fighter, 'seeded Fighter missing').toBeTruthy();

    // Visible but immutable, so 403 here rather than the 404 a hidden row gets.
    const patch = await page.request.patch(`${BACKEND}/api/srd/classes/${fighter!.id}`, {
      data: { description: 'Buffed.' },
      headers,
    });
    expect(patch.status()).toBe(403);

    const del = await page.request.delete(`${BACKEND}/api/srd/classes/${fighter!.id}`, { headers });
    expect(del.status()).toBe(403);
  });

  // ── Per-level features (VEG-507) ─────────────────────────────────────────
  test('a class carries per-level features, and a PATCH replaces them wholesale', async ({
    page,
  }) => {
    await registerAndLogin(page, 'class-features', 'E2E Feature Author');
    const headers = await csrfHeaders(page);
    const name = `Warden ${Date.now()}`;

    const created = await page.request.post(`${BACKEND}/api/srd/classes`, {
      data: {
        name,
        hitDie: 'd10',
        features: [
          { name: 'Wardens Bond', level: 1, description: 'A sworn bond to wild places.' },
          // The case the unique key was widened for: one name, several levels.
          { name: 'Ability Score Improvement', level: 4, description: 'Raise two scores.' },
          { name: 'Ability Score Improvement', level: 8, description: 'Raise two scores.' },
        ],
      },
      headers,
    });
    expect(created.ok(), `create failed: ${created.status()}`).toBeTruthy();
    const id = (await created.json()).id as string;

    // The write response deliberately carries the class row without its features
    // (POST and PATCH agree on that); the detail read is where they come back.
    const detail = await page.request.get(`${BACKEND}/api/srd/classes/${id}`);
    const features = (await detail.json()).features as { name: string; level: number }[];
    expect(features.map(f => [f.level, f.name])).toEqual([
      [1, 'Wardens Bond'],
      [4, 'Ability Score Improvement'],
      [8, 'Ability Score Improvement'],
    ]);

    // Two rows sharing a name AND a level is what the index still refuses, and
    // the DTO catches it first so the author gets a 400 naming the field rather
    // than a conflict about the wrong entity.
    const duplicated = await page.request.patch(`${BACKEND}/api/srd/classes/${id}`, {
      data: {
        features: [
          { name: 'Rage', level: 1 },
          { name: 'Rage', level: 1 },
        ],
      },
      headers,
    });
    expect(duplicated.status()).toBe(400);

    // Replacement, not a merge: the two originals are gone, not merged with.
    const replaced = await page.request.patch(`${BACKEND}/api/srd/classes/${id}`, {
      data: { features: [{ name: 'Wardens Bond', level: 2, description: 'Rewritten.' }] },
      headers,
    });
    expect(replaced.ok(), `patch failed: ${replaced.status()}`).toBeTruthy();

    const afterReplace = await page.request.get(`${BACKEND}/api/srd/classes/${id}`);
    expect((await afterReplace.json()).features).toMatchObject([
      { name: 'Wardens Bond', level: 2, description: 'Rewritten.' },
    ]);

    // A PATCH that says nothing about features leaves them alone...
    const unrelated = await page.request.patch(`${BACKEND}/api/srd/classes/${id}`, {
      data: { description: 'Unrelated edit.' },
      headers,
    });
    expect(unrelated.ok()).toBeTruthy();
    const afterUnrelated = await page.request.get(`${BACKEND}/api/srd/classes/${id}`);
    expect((await afterUnrelated.json()).features).toHaveLength(1);

    // ...and an empty array clears them.
    const cleared = await page.request.patch(`${BACKEND}/api/srd/classes/${id}`, {
      data: { features: [] },
      headers,
    });
    expect(cleared.ok()).toBeTruthy();
    const afterClear = await page.request.get(`${BACKEND}/api/srd/classes/${id}`);
    expect((await afterClear.json()).features).toEqual([]);
  });

  // The leak this slice exists to close. A ClassFeature row carries no
  // contentSource of its own, so before VEG-507 the feature search and the
  // printable-card hydrator queried the feature tables with no join back to a
  // visible parent — VEG-335 in a new place. Neither the mocked unit suite (it
  // asserts recorded arguments) nor the real-DB spec (it calls the service
  // directly) proves the wiring from HTTP request to scoped query, which is what
  // this covers.
  test("another user's homebrew class features never surface in search or print", async ({
    page,
    browser,
  }) => {
    await registerAndLogin(page, 'feat-owner', 'E2E Feature Owner');
    const ownerHeaders = await csrfHeaders(page);
    const featureName = `Secret Bond ${Date.now()}`;

    const created = await page.request.post(`${BACKEND}/api/srd/classes`, {
      data: {
        name: `Hidden Warden ${Date.now()}`,
        hitDie: 'd10',
        features: [{ name: featureName, level: 1, description: 'Nobody else may see this.' }],
      },
      headers: ownerHeaders,
    });
    expect(created.ok()).toBeTruthy();
    const classId = (await created.json()).id as string;

    const ownerDetail = await page.request.get(`${BACKEND}/api/srd/classes/${classId}`);
    const featureId = ((await ownerDetail.json()).features as { id: string }[])[0].id;

    // The owner sees their own feature on all three surfaces.
    const ownerSearch = await page.request.get(
      `${BACKEND}/api/srd/features?q=${encodeURIComponent(featureName)}`
    );
    expect((await ownerSearch.json()).total).toBe(1);

    const ownerUnified = await page.request.get(
      `${BACKEND}/api/srd/search?types=feature&q=${encodeURIComponent(featureName)}`
    );
    expect((await ownerUnified.json()).total).toBe(1);

    const ownerCards = await page.request.post(`${BACKEND}/api/srd/cards`, {
      data: { selections: [{ type: 'feature', ids: [featureId] }] },
      headers: ownerHeaders,
    });
    expect((await ownerCards.json()).groups[0].cards).toHaveLength(1);

    // A second, unrelated user sees none of it — including when handed the id.
    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await registerAndLogin(strangerPage, 'feat-stranger', 'E2E Feature Stranger');
    const strangerHeaders = await csrfHeaders(strangerPage);

    const strangerSearch = await strangerPage.request.get(
      `${BACKEND}/api/srd/features?q=${encodeURIComponent(featureName)}`
    );
    expect((await strangerSearch.json()).total).toBe(0);

    // Naming the parent class id directly is the obvious way to try to enumerate
    // someone else's features, so the scoping has to survive it.
    const strangerByParent = await strangerPage.request.get(
      `${BACKEND}/api/srd/features?parentType=class&parentId=${classId}`
    );
    expect((await strangerByParent.json()).total).toBe(0);

    const strangerUnified = await strangerPage.request.get(
      `${BACKEND}/api/srd/search?types=feature&q=${encodeURIComponent(featureName)}`
    );
    expect((await strangerUnified.json()).total).toBe(0);

    const strangerCards = await strangerPage.request.post(`${BACKEND}/api/srd/cards`, {
      data: { selections: [{ type: 'feature', ids: [featureId] }] },
      headers: strangerHeaders,
    });
    expect((await strangerCards.json()).groups[0].cards).toEqual([]);

    // The route moved off SrdController's blanket URL-keyed cache in this slice.
    // An anonymous request to the same URL the owner just used must not be served
    // the owner's cached response — the failure mode the move exists to prevent.
    const anonSearch = await strangerPage.request.get(
      `${BACKEND}/api/srd/features?q=${encodeURIComponent(featureName)}`,
      { headers: { Cookie: '' } }
    );
    expect((await anonSearch.json()).total).toBe(0);

    // The SRD catalog is still there for everyone — the scoping narrowed the
    // right thing, not everything.
    const catalog = await strangerPage.request.get(`${BACKEND}/api/srd/features?parentType=class`);
    expect((await catalog.json()).total).toBeGreaterThan(0);

    await stranger.close();
  });
});
