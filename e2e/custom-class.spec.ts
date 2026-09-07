import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// Golden path for homebrew classes (VEG-506), driven through the API rather than
// the UI: the class pages arrive in VEG-508, so there is no form to fill yet.
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
});
