import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-463 — weapon proficiency resolution for derived attack rows. A catalog
// weapon snapshots its simple/martial tier; the derivation adds the
// proficiency bonus only when the class's weapon proficiencies (srd_classes)
// or the character's own proficiencies list cover the weapon. Non-proficient
// rows derive from the ability modifier alone and carry a "Not proficient"
// note.

test.describe('character sheet — weapon proficiency (VEG-463)', () => {
  test('a wizard derives a longsword without the proficiency bonus; a fighter keeps it', async ({
    page,
  }) => {
    await registerAndLogin(page, 'weapon-prof', 'Player One');
    const headers = await csrfHeaders(page);

    const create = async (data: Record<string, unknown>) => {
      const res = await page.request.post(`${BACKEND}/api/characters`, { data, headers });
      expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
      return (await res.json()).id as string;
    };

    // Str 16 (+3) and level 3 (prof +2) for both, so proficiency is the only
    // differentiator between their derived longsword rows.
    const wizardId = await create({
      name: 'Fizban Frays',
      class: 'Wizard',
      level: 3,
      abilityScores: { strength: 16, dexterity: 14, constitution: 12 },
      hitPoints: { max: 17, current: 17, temporary: 0 },
      // The guided builder copies the class weapon list here; none of these
      // cover a martial longsword.
      proficiencies: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'],
      inventory: [],
    });
    const fighterId = await create({
      name: 'Bruni Oakshield',
      class: 'Fighter',
      level: 3,
      abilityScores: { strength: 16, dexterity: 14, constitution: 14 },
      hitPoints: { max: 28, current: 28, temporary: 0 },
      // Nothing on the character row: the grant must come from the Fighter
      // class's srd_classes weapon proficiencies ("Martial weapons").
      inventory: [],
    });

    const addAndEquipLongsword = async () => {
      await page.getByRole('tab', { name: 'Spells & Details' }).click();
      await page.getByPlaceholder('Search the catalog to autofill…').fill('Longsword');
      await page.getByRole('button', { name: 'Add Longsword', exact: true }).click();
      await expect(page.getByTestId('catalog-detail')).toContainText('Linked to catalog');
      await page.getByRole('button', { name: 'Add item', exact: true }).click();
      await page.getByRole('button', { name: 'Equip Longsword' }).click();
      await expect(page.getByRole('button', { name: 'Unequip Longsword' })).toBeVisible();
      await page.getByRole('tab', { name: 'Character' }).click();
    };

    // Wizard: no grant covers the martial longsword → Str only, flagged.
    await page.goto(`/characters/${wizardId}`);
    await expect(page.getByRole('heading', { name: 'Fizban Frays' })).toBeVisible();
    await addAndEquipLongsword();
    const wizardRow = page.getByRole('row', { name: /Longsword/ });
    await expect(wizardRow).toContainText('Not proficient');
    await expect(wizardRow).toContainText('1d8+3 Slashing');
    // Attack is the bare +3 Str modifier — the +2 proficiency bonus is
    // withheld. Assert the Atk cell itself (anchored; the cell also carries
    // the roll button's "Atk" label): the row's damage text also contains
    // "+3", so a row-level contains-check would be vacuous.
    await expect(wizardRow.locator('td').nth(1)).toHaveText(/^\+3(?!\d)/);

    // Fighter: the class weapon list grants it → +3 Str +2 prof, no note.
    await page.goto(`/characters/${fighterId}`);
    await expect(page.getByRole('heading', { name: 'Bruni Oakshield' })).toBeVisible();
    await addAndEquipLongsword();
    const fighterRow = page.getByRole('row', { name: /Longsword/ });
    await expect(fighterRow).toContainText('+5');
    await expect(fighterRow).not.toContainText('Not proficient');

    // Reload the wizard: the tier snapshot (weaponCategory) must survive the
    // PATCH round-trip and persistence (the VEG-349 DTO-whitelist guard).
    await page.goto(`/characters/${wizardId}`);
    await expect(page.getByRole('row', { name: /Longsword/ })).toContainText('Not proficient');
  });
});
