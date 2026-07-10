import { expect, test } from '@playwright/test';
import { registerAndLogin, csrfHeaders, BACKEND } from './helpers';

// VEG-409 — limited-use resource tracker. The owner manages player-defined
// pools (add / spend / restore / edit / remove) from the sheet's Resources
// card; every write is an optimistic-locked PATCH that persists across reload.

test.describe('character sheet — resource tracker', () => {
  test('owner adds, spends, edits, and removes a resource; state persists across reload', async ({
    page,
  }) => {
    await registerAndLogin(page, 'resources-owner', 'Pooler One');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Vess Duskwhisper',
        class: 'Sorcerer',
        level: 3,
        abilityScores: { strength: 8, dexterity: 14, constitution: 14, charisma: 16 },
        hitPoints: { max: 21, current: 21, temporary: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Vess Duskwhisper' })).toBeVisible();

    const tracker = page.getByTestId('resource-tracker');
    await expect(tracker.getByText('No resources tracked')).toBeVisible();

    // Add a small pool → renders as a pip track.
    await tracker.getByLabel('New resource name').fill('Sorcery Points');
    await tracker.getByLabel('New resource max').fill('3');
    await tracker.getByLabel('New resource recharge').selectOption('long');
    await tracker.getByRole('button', { name: 'Add resource' }).click();
    await expect(tracker.getByText('Sorcery Points')).toBeVisible();
    await expect(tracker.getByTestId('resource-0-recharge')).toHaveText('Long rest');
    await expect(tracker.locator('[data-testid^="resource-0-pip-"]')).toHaveCount(3);

    // Spend two uses by clicking the second pip.
    await tracker.getByRole('button', { name: 'Sorcery Points use 2' }).click();
    await expect(
      tracker.locator('[data-testid^="resource-0-pip-"][data-filled="true"]')
    ).toHaveCount(2);

    // Persists across reload (it's a real PATCH, not local state).
    await page.reload();
    await expect(
      tracker.locator('[data-testid^="resource-0-pip-"][data-filled="true"]')
    ).toHaveCount(2);

    // Edit: rename and grow the pool.
    await tracker.getByLabel('Edit Sorcery Points').click();
    await tracker.getByLabel('Edit resource name').fill('Font of Magic');
    await tracker.getByLabel('Edit resource max').fill('4');
    await tracker.getByRole('button', { name: 'Save resource' }).click();
    await expect(tracker.getByText('Font of Magic')).toBeVisible();
    await expect(tracker.locator('[data-testid^="resource-0-pip-"]')).toHaveCount(4);

    // Remove it → back to the empty state.
    await tracker.getByLabel('Remove Font of Magic').click();
    await expect(tracker.getByText('No resources tracked')).toBeVisible();
  });

  // No read-only e2e path: GET /characters/:id is owner-only (findOneForUser
  // 403s everyone else), so a non-owner can never load the sheet. The tracker's
  // read-only rendering is covered by the ResourceTracker Vitest spec.

  test('a counter pool (max > 10) spends and restores with the −/+ controls', async ({ page }) => {
    await registerAndLogin(page, 'resources-counter', 'Pooler Two');
    const headers = await csrfHeaders(page);

    const res = await page.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Torv Ashenmark',
        class: 'Sorcerer',
        level: 20,
        hitPoints: { max: 110, current: 110, temporary: 0 },
        currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
        resources: [{ name: 'Sorcery Points', max: 20, used: 4, recharge: 'long' }],
      },
      headers,
    });
    expect(res.ok(), `character create failed: ${res.status()}`).toBeTruthy();
    const characterId = (await res.json()).id as string;

    await page.goto(`/characters/${characterId}`);
    await expect(page.getByRole('heading', { name: 'Torv Ashenmark' })).toBeVisible();

    const tracker = page.getByTestId('resource-tracker');
    // Large pool renders the remaining/max counter, no pips.
    await expect(tracker.getByText('16/20')).toBeVisible();
    await expect(tracker.locator('[data-testid^="resource-0-pip-"]')).toHaveCount(0);

    await tracker.getByLabel('Spend Sorcery Points').click();
    await expect(tracker.getByText('15/20')).toBeVisible();
    await tracker.getByLabel('Restore Sorcery Points').click();
    await expect(tracker.getByText('16/20')).toBeVisible();
  });
});
