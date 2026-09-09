import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// VEG-524: a character now persists `classId` alongside the display name, so a
// *loaded* character re-resolves its class by id even when the name collides
// with a homebrew class of the same name (legal since VEG-506).
//
// Why the existing suites miss this. `custom-class.spec.ts` proves a duplicate
// class name is *accepted* but never puts a character on one. The VEG-454
// level-up spec creates its homebrew class with a timestamped unique name, so it
// never collides. Neither loads a character whose class name matches two rows —
// which is the only state where the bug appears.
//
// The name here is deliberately NOT uniquified. That is the point.
test.describe('character class id round-trip (VEG-524)', () => {
  test('a loaded character levels up on the class its id names, not a duplicate', async ({
    page,
  }) => {
    await registerAndLogin(page, 'class-id', 'E2E Class Ider');
    const headers = await csrfHeaders(page);

    // Author a homebrew "Fighter" so the name collides with the SRD Fighter.
    // Both rows now ride this owner's /srd/classes catalog. The d12 hit die and
    // the level-6 feature are the observable difference from the SRD row (d10,
    // "Extra Attack") — they name which row the sheet actually resolved.
    const created = await page.request.post(`${BACKEND}/api/srd/classes`, {
      data: {
        name: 'Fighter',
        hitDie: 'd12',
        primaryAbilities: ['Strength'],
        savingThrows: ['Strength', 'Constitution'],
        features: [
          { name: 'Blood Frenzy', level: 6, description: 'A homebrew-only grant.' },
        ],
      },
      headers,
    });
    expect(created.status(), await created.text()).toBe(201);
    const homebrew = await created.json();
    expect(homebrew).toMatchObject({ name: 'Fighter', contentSource: 'homebrew' });

    // Both rows are visible to this owner under the same name — the ambiguity
    // the fix exists to resolve.
    const list = await page.request.get(`${BACKEND}/api/srd/classes`);
    const fighters = ((await list.json()) as { name: string }[]).filter(c => c.name === 'Fighter');
    expect(fighters.length).toBe(2);

    // ── A character on the homebrew Fighter, 100 XP short of level 6 ────────
    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Duplicate Fighter',
        class: 'Fighter',
        classId: homebrew.id,
        level: 5,
        experiencePoints: 13900,
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10 },
        hitPoints: { max: 44, current: 44, temporary: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const character = await res.json();
    // The soft ref survived the create DTO's whitelist and the response DTO's
    // @Expose list — neither is implied by the column existing (VEG-349).
    expect(character.classId).toBe(homebrew.id);

    // ── Reopen the sheet: the crux of VEG-524 ──────────────────────────────
    // The character now carries only its persisted state. Its class name
    // ("Fighter") matches two rows, so a name-only load would resolve to
    // whichever the query plan returned first.
    await page.goto(`/characters/${character.id}`);
    await expect(page.getByRole('heading', { name: 'Duplicate Fighter' })).toBeVisible();

    const section = page.getByTestId('level-up-section');
    await section.getByLabel('XP to award').fill('100');
    await section.getByRole('button', { name: 'Award XP' }).click();
    await expect(section.getByText('Ready to level up!')).toBeVisible();

    await section.getByRole('button', { name: 'Level Up' }).click();
    const dialog = page.getByRole('dialog');

    // The homebrew feature is offered and the SRD one is not: the id won.
    await expect(dialog.getByRole('checkbox', { name: /blood frenzy/i })).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: /extra attack/i })).toHaveCount(0);

    // And the hit die follows it. d12 average is 7, +2 CON = +9 HP; resolving to
    // the SRD Fighter would read d10 → +8. This is the number that gets written
    // into a permanent HP maximum, which is what made the bug worth fixing.
    await expect(dialog.getByTestId('hp-gain-preview')).toContainText('+9 HP');

    await dialog.getByRole('button', { name: 'Confirm Level Up' }).click();
    await expect(page.getByTestId('level-badge')).toHaveText('6');
  });

  // The other half of the contract: deleting the homebrew row leaves a stale id
  // behind, and the character must degrade to the unambiguous-name path rather
  // than losing its class data.
  test('a stale id degrades to the name path once the homebrew class is deleted', async ({
    page,
  }) => {
    await registerAndLogin(page, 'class-id-stale', 'E2E Stale Ider');
    const headers = await csrfHeaders(page);

    const created = await page.request.post(`${BACKEND}/api/srd/classes`, {
      data: { name: 'Warden', hitDie: 'd12', savingThrows: ['Strength'] },
      headers,
    });
    expect(created.status(), await created.text()).toBe(201);
    const homebrew = await created.json();

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Orphaned Warden',
        // A name only the (about to be deleted) homebrew row has, so after the
        // delete neither key resolves and the sheet must still render.
        class: 'Warden',
        classId: homebrew.id,
        level: 5,
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10 },
        hitPoints: { max: 44, current: 44, temporary: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const character = await res.json();

    const deleted = await page.request.delete(`${BACKEND}/api/srd/classes/${homebrew.id}`, {
      headers,
    });
    expect(deleted.ok(), `delete failed: ${deleted.status()}`).toBeTruthy();

    // The read path must not 500 on a dangling soft ref — it is not an FK, so
    // nothing at the database level cleaned it up.
    const reload = await page.request.get(`${BACKEND}/api/characters/${character.id}`);
    expect(reload.ok(), `reload failed: ${reload.status()}`).toBeTruthy();
    expect((await reload.json()).classId).toBe(homebrew.id);

    // And the sheet still renders, keeping the display name.
    await page.goto(`/characters/${character.id}`);
    await expect(page.getByRole('heading', { name: 'Orphaned Warden' })).toBeVisible();
    await expect(page.getByTestId('field-class')).toContainText('Warden');
  });
});
