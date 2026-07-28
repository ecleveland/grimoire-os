import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-408 — PC status tracker. The owner can add/remove conditions, set the
// exhaustion 1–6 track, and start/name/stop concentration from the sheet, each
// change persisted optimistic-lock-safe through the character PATCH.

test.describe('character sheet — status tracker', () => {
  test('owner drives conditions, exhaustion, and concentration; all persist', async ({ page }) => {
    await registerAndLogin(page, 'status-tracker', 'Player One');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Mara Stillwater',
        class: 'Cleric',
        level: 3,
        abilityScores: { strength: 10, dexterity: 12, wisdom: 16 },
        hitPoints: { max: 21, current: 21, temporary: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Mara Stillwater' })).toBeVisible();

    // Scope to the status card: bare text like 'Prone' also matches the
    // add-condition <option>s, and 'Concentrating' matches the Stop button.
    const tracker = page.getByTestId('status-tracker');
    const concentrationChip = tracker.getByTitle('Concentration');

    // Empty state renders (no crash on null/absent status fields).
    await expect(tracker.getByText('No active conditions')).toBeVisible();

    // Conditions: add two via the select, chips appear. (Chips are located by
    // testid: the chip's text content includes its remove ×, so exact-text
    // matching can't see it, and bare text also matches the hidden <option>s.)
    await tracker.getByLabel('Add condition').selectOption('Poisoned');
    await expect(tracker.getByTestId('condition-chip-Poisoned')).toBeVisible();
    await tracker.getByLabel('Add condition').selectOption('Prone');
    await expect(tracker.getByTestId('condition-chip-Prone')).toBeVisible();

    // Remove one via its chip ×.
    await tracker.getByRole('button', { name: 'Remove Prone' }).click();
    await expect(tracker.getByTestId('condition-chip-Prone')).not.toBeVisible();

    // Exhaustion: click level 3 on the track.
    await tracker.getByRole('button', { name: 'Set exhaustion level 3' }).click();
    await expect(tracker.getByText('Level 3')).toBeVisible();

    // Concentration: start, then name the spell (committed on Enter).
    await tracker.getByRole('button', { name: 'Concentrate', exact: true }).click();
    await expect(concentrationChip).toBeVisible();
    const spellInput = tracker.getByLabel('Concentration spell');
    await spellInput.fill('Hold Person');
    await spellInput.press('Enter');
    await expect(concentrationChip).toHaveText('Concentrating: Hold Person');

    // Reload: everything persisted.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mara Stillwater' })).toBeVisible();
    await expect(tracker.getByTestId('condition-chip-Poisoned')).toBeVisible();
    await expect(tracker.getByText('Level 3')).toBeVisible();
    await expect(concentrationChip).toHaveText('Concentrating: Hold Person');

    // Clear concentration and exhaustion; cleared state persists too.
    await tracker.getByRole('button', { name: 'Stop concentrating' }).click();
    await expect(concentrationChip).not.toBeVisible();
    await tracker.getByRole('button', { name: 'Set exhaustion level 3' }).click();
    await expect(tracker.getByText('Level 3')).not.toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Mara Stillwater' })).toBeVisible();
    await expect(concentrationChip).not.toBeVisible();
    await expect(tracker.getByText('Level 3')).not.toBeVisible();
  });

  // VEG-449 — exhaustion is no longer display-only: the server-computed block
  // reduces every d20 Test by 2 × level and Speed by 5 ft × level, and the sheet
  // renders those reduced values. This walks the real round-trip (PATCH → recompute
  // → re-render), which the unit specs can only model with a fixture.
  test('exhaustion penalties reach the sheet and clear when the track is reset', async ({
    page,
  }) => {
    await registerAndLogin(page, 'exhaustion-penalty', 'Player Two');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Bran Coldhearth',
        class: 'Fighter',
        level: 5,
        // DEX 12 → +1 initiative; WIS 14 → passive perception 12 unproficient.
        abilityScores: { strength: 16, dexterity: 12, constitution: 14, wisdom: 14 },
        hitPoints: { max: 44, current: 44, temporary: 0 },
        speed: 30,
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Bran Coldhearth' })).toBeVisible();

    const tracker = page.getByTestId('status-tracker');
    const speed = page.getByTestId('stat-speed');
    const initiative = page.getByTestId('stat-initiative');

    // Unexhausted baseline.
    await expect(speed).toContainText('30 ft');
    await expect(initiative).toContainText('+1');
    await expect(tracker.getByTestId('exhaustion-effect')).toHaveCount(0);

    // Level 2 → −4 to d20 Tests, −10 ft Speed.
    await tracker.getByRole('button', { name: 'Set exhaustion level 2' }).click();
    await expect(tracker.getByTestId('exhaustion-effect')).toHaveText(
      '−4 to d20 Tests · −10 ft Speed'
    );
    await expect(speed).toContainText('20 ft');
    await expect(initiative).toContainText('-3');

    // Survives a reload — the penalty is recomputed server-side, not local state.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bran Coldhearth' })).toBeVisible();
    await expect(speed).toContainText('20 ft');
    await expect(initiative).toContainText('-3');

    // Level 6 reads as death rather than a penalty line.
    await tracker.getByRole('button', { name: 'Set exhaustion level 6' }).click();
    await expect(tracker.getByTestId('exhaustion-effect')).toHaveText('Death');
    await expect(speed).toContainText('0 ft');

    // Clearing the track restores every value.
    await tracker.getByRole('button', { name: 'Set exhaustion level 6' }).click();
    await expect(tracker.getByTestId('exhaustion-effect')).toHaveCount(0);
    await expect(speed).toContainText('30 ft');
    await expect(initiative).toContainText('+1');
  });
});
