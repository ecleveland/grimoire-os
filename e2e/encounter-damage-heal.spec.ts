import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Damage & heal controls + temporary HP (VEG-286)', () => {
  test('temp HP grant, temp-first damage, and clamped heal all persist', async ({ page }) => {
    await registerAndLogin(page, 'dmgheal', 'E2E Damage-Heal DM');
    const { campaignId, encounterId } = await createEncounter(page, 'DmgHeal Camp');

    await page.goto(`/campaigns/${campaignId}/encounters/${encounterId}`);
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();

    const amount = page.getByRole('textbox', { name: /damage or heal amount for hero/i });
    const hp = page.getByRole('spinbutton', { name: /hp for hero/i });

    // Buttons stay disabled until a positive amount is entered.
    const damageBtn = page.getByRole('button', { name: /^damage hero$/i });
    await expect(damageBtn).toBeDisabled();

    // Grant 5 temp HP — the badge appears, real HP untouched (Hero is 24/24).
    await amount.fill('5');
    await page.getByRole('button', { name: /grant temp hp to hero/i }).click();
    await expect(page.getByText('+5 temp')).toBeVisible();
    await expect(hp).toHaveValue('24');

    // 8 damage spends the 5 temp first, then 3 real HP: 24 → 21, badge gone.
    await amount.fill('8');
    await damageBtn.click();
    await expect(page.getByText('+5 temp')).toHaveCount(0);
    await expect(hp).toHaveValue('21');

    // A 99-point heal clamps to maxHp.
    await amount.fill('99');
    await page.getByRole('button', { name: /^heal hero$/i }).click();
    await expect(hp).toHaveValue('24');

    // The writes reached the server — damage Hero down again and reload.
    await amount.fill('10');
    await damageBtn.click();
    await expect(hp).toHaveValue('14');
    await page.reload();
    await expect(page.getByRole('heading', { name: /goblin ambush/i })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: /hp for hero/i })).toHaveValue('14');
  });
});
