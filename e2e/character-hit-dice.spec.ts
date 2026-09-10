import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// VEG-530: `Character.hitDice` is populated at the write boundary, from the class
// the character actually resolves to, so the sheet stops asking four different
// clients to each invent a die for a null pool.
//
// Why the unit suites miss this. The backend suite mocks Prisma, so it can prove
// the service *asks* for a pool but not that the column round-trips through the
// create DTO's whitelist and the response DTO's @Expose list — neither of which
// is implied by the column existing (the VEG-349 lesson). The frontend suite
// mocks `apiFetch`, so every character it renders already carries whatever pool
// the fixture chose. Only a real request against a real catalog joins the two.
test.describe('hit dice are seeded from the resolved class (VEG-530)', () => {
  test('an API create with a class and no hit dice arrives on the sheet with a pool', async ({
    page,
  }) => {
    await registerAndLogin(page, 'hit-dice-seed', 'E2E Dice Seeder');
    const headers = await csrfHeaders(page);

    // No `hitDice`, and no `classId` either — the shape every API client sends
    // and the one that used to reach the sheet with a null pool forever.
    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Seeded Fighter',
        class: 'Fighter',
        level: 5,
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10 },
        hitPoints: { max: 44, current: 30, temporary: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const character = await res.json();

    // The SRD Fighter's die is d10, fetched independently so this does not just
    // compare the server's answer with itself.
    const list = await page.request.get(`${BACKEND}/api/srd/classes`);
    const srdFighter = ((await list.json()) as { name: string; hitDie: string }[]).find(
      c => c.name === 'Fighter'
    );
    expect(srdFighter?.hitDie, 'SRD Fighter missing from the seeded catalog').toBe('d10');

    // A level-5 character owns five unspent dice.
    expect(character.hitDice).toEqual({ dieType: 'd10', total: 5, spent: 0 });

    // And it is on the sheet, which is the part the response DTO's @Expose list
    // has to carry. Before this the block simply did not render.
    await page.goto(`/characters/${character.id}`);
    const hitDiceBlock = page.getByTestId('hd-block');
    await expect(hitDiceBlock).toContainText('0/5');
    await expect(hitDiceBlock).toContainText('d10');

    // The pool is real, not decorative: a short rest can spend it. This is the
    // player who, before the fix, met "No Hit Dice on this sheet" and was never
    // healed because they had never opened the classic editor.
    await page.getByRole('button', { name: 'Short Rest' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('dice-available')).toHaveText('5');
    await dialog.getByRole('button', { name: /spend a hit die/i }).click();
    // d10 average is 6, +2 CON = 8 HP, on a character sitting at 30/44.
    await expect(dialog.getByTestId('die-row-0')).toContainText('8');
  });

  // The other half: a class that cannot be resolved has no die to give, and the
  // server says so with a null rather than a guess. This is the population the
  // VEG-528 level-up picker exists for, and it has to stay reachable — a seed
  // that guessed here would silence that picker for everyone.
  test('an unresolvable class seeds nothing and leaves the level-up picker in play', async ({
    page,
  }) => {
    await registerAndLogin(page, 'hit-dice-unresolved', 'E2E Dice Refuser');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Off Catalog',
        class: 'Bloodbinder',
        level: 5,
        experiencePoints: 14000,
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10 },
        hitPoints: { max: 44, current: 44, temporary: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const character = await res.json();

    expect(character.classId).toBeNull();
    expect(character.hitDice).toBeNull();

    await page.goto(`/characters/${character.id}`);
    // No pool, so no block — the sheet does not render an invented one.
    await expect(page.getByTestId('hd-block')).toHaveCount(0);

    await page.getByTestId('level-up-section').getByRole('button', { name: 'Level Up' }).click();
    await expect(
      page.getByRole('dialog').getByRole('combobox', { name: /hit die/i })
    ).toBeVisible();
  });

  // The sharp edge the ticket was filed for. VEG-528 tells a player whose class
  // will not resolve to re-pick it in the classic editor — and that editor used
  // to fill a null pool with a d8 on load and send it on every save, so saving
  // any unrelated field persisted a die nobody chose. The stored die then
  // outranked the picker above, so the remedy permanently disabled the fix.
  test('saving an unrelated field in the classic editor does not invent a pool', async ({
    page,
  }) => {
    await registerAndLogin(page, 'hit-dice-editor', 'E2E Dice Editor');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Silent D8',
        class: 'Bloodbinder',
        level: 5,
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10 },
        hitPoints: { max: 44, current: 44, temporary: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const character = await res.json();
    expect(character.hitDice).toBeNull();

    await page.goto(`/characters/${character.id}/edit`);
    await expect(page.getByLabel(/^name/i)).toHaveValue('Silent D8');

    // The pool presents as unrecorded rather than as a d8 the player never chose.
    await expect(page.getByLabel(/hit die$/i)).toHaveValue('');
    await expect(page.getByLabel(/hit dice total/i)).toBeDisabled();

    await page.getByLabel(/^name/i).fill('Renamed Not Rediced');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('heading', { name: 'Renamed Not Rediced' })).toBeVisible();

    // Read the column back from the API, not the DOM: the whole failure mode was
    // a value silently reaching the database.
    const reloaded = await page.request.get(`${BACKEND}/api/characters/${character.id}`);
    expect(reloaded.ok(), `reload failed: ${reloaded.status()}`).toBeTruthy();
    expect((await reloaded.json()).hitDice).toBeNull();

    // So the picker is still there for them, which is the whole point.
    await page.getByTestId('level-up-section').getByRole('button', { name: 'Level Up' }).click();
    await expect(
      page.getByRole('dialog').getByRole('combobox', { name: /hit die/i })
    ).toBeVisible();
  });

  // Recording a die is still possible, and deliberate. The editor is where a
  // player without one puts it on the sheet, and it has to write the whole pool
  // rather than a die with no dice behind it.
  test('picking a die in the editor records a pool sized to the level', async ({ page }) => {
    await registerAndLogin(page, 'hit-dice-pick', 'E2E Dice Picker');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Picks A Die',
        class: 'Bloodbinder',
        level: 3,
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, intelligence: 10 },
        hitPoints: { max: 24, current: 24, temporary: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const character = await res.json();

    await page.goto(`/characters/${character.id}/edit`);
    await page.getByLabel(/hit die$/i).selectOption('d12');
    await expect(page.getByLabel(/hit dice total/i)).toHaveValue('3');

    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByRole('heading', { name: 'Picks A Die' })).toBeVisible();

    const reloaded = await page.request.get(`${BACKEND}/api/characters/${character.id}`);
    expect((await reloaded.json()).hitDice).toEqual({ dieType: 'd12', total: 3, spent: 0 });
  });
});
