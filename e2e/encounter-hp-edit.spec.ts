import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Encounter HP edits commit once, version-guarded (VEG-315)', () => {
  test('typing an HP value sends a single PATCH on Enter and the value persists', async ({
    page,
  }) => {
    await registerAndLogin(page, 'hp', 'E2E HP-Edit DM');
    const { campaignId, encounterId } = await createEncounter(page, 'HP Camp');

    const patches: string[] = [];
    page.on('request', req => {
      if (req.method() === 'PATCH' && req.url().includes(`/encounters/${encounterId}`)) {
        patches.push(req.postData() ?? '');
      }
    });

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    // Type "10" keystroke-by-keystroke — no PATCH may fire while typing.
    const hpInput = page.getByRole('spinbutton');
    await hpInput.click();
    await hpInput.clear();
    await hpInput.pressSequentially('10');
    expect(patches).toHaveLength(0);

    // Enter commits exactly one PATCH, carrying the optimistic-lock guard.
    await hpInput.press('Enter');
    await expect.poll(() => patches.length).toBe(1);
    const body = JSON.parse(patches[0]);
    expect(body.expectedVersion).toBeDefined();
    expect(body.combatants[0].hp).toBe(10);

    // The committed value survives a reload — it reached the server.
    await page.reload();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect(page.getByRole('spinbutton')).toHaveValue('10');
  });
});
