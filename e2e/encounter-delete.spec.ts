import { expect, test } from '@playwright/test';
import { createEncounter, registerAndLogin } from './helpers';

test.describe('Delete encounter from campaign page (VEG-291)', () => {
  test('DM deletes an encounter from the encounters tab', async ({ page }) => {
    await registerAndLogin(page, 'delenc', 'E2E DeleteEncounter DM');
    const { campaignId } = await createEncounter(page, 'DelEnc Camp');

    await page.goto(`/campaigns/${campaignId}`);
    await page.getByRole('button', { name: 'Encounters', exact: true }).click();
    await expect(page.getByText('Goblin Ambush')).toBeVisible();

    // Delete — the confirm dialog gates the destructive write.
    await page.getByRole('button', { name: /delete goblin ambush/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(/delete encounter/i);
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText(/encounter deleted/i)).toBeVisible();
    await expect(page.getByText('Goblin Ambush')).toHaveCount(0);

    // Durable, not client-side only: still gone after a reload.
    await page.reload();
    await page.getByRole('button', { name: 'Encounters', exact: true }).click();
    await expect(page.getByText(/no encounters yet/i)).toBeVisible();
    await expect(page.getByText('Goblin Ambush')).toHaveCount(0);
  });
});
