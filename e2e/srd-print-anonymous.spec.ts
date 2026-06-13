import { expect, test } from '@playwright/test';

// Anonymous /srd/print hydrate (VEG-332). /srd browsing is public and the
// print tray is purely client-side, so a logged-out visitor can build a print
// set. The hydrate call (`POST /srd/cards`) is an unsafe method, but the
// csrf_token cookie is only minted on login/register/refresh — so before the
// @SkipCsrf() exemption, the anonymous hydrate POST 403'd on CSRF, apiFetch
// treated that as a refreshable failure, the refresh failed (no session), and
// the visitor was bounced to /login off a public page. This pins the fix: no
// login, no bounce, the card renders.
test.describe('SRD print for anonymous visitors (VEG-332)', () => {
  test('hydrates and renders a catalog monster without bouncing to /login', async ({ page }) => {
    // Deliberately no register/login — start fully anonymous.
    await page.goto('/srd/monsters');
    const addMonster = page.getByRole('button', { name: /^Add .+ to print set$/ }).first();
    await expect(addMonster).toBeVisible({ timeout: 10_000 });
    await addMonster.click();

    await page.getByRole('link', { name: 'Print (1)' }).click();

    // The headline assertion: we land on /srd/print and stay there. Before the
    // fix the hydrate POST's terminal CSRF failure redirected to /login.
    await expect(page).toHaveURL('/srd/print');

    const groups = page.getByTestId('print-group');
    await expect(groups).toHaveCount(1, { timeout: 10_000 });
    await expect(groups.first()).toHaveAttribute('data-card-type', 'monster');
    await expect(groups.first().getByTestId('print-card').first()).toBeVisible();

    // No error toast, and the visitor was never sent to the login page.
    await expect(page).not.toHaveURL(/\/login/);
  });
});
