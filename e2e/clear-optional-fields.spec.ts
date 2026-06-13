import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// VEG-316: clearing an optional form field must persist. The frontend used to
// serialize cleared fields as undefined, which JSON.stringify drops from the
// PATCH body — the backend kept the old value while the UI showed success.

test.describe('clearing optional fields persists', () => {
  test('clearing a note session number survives a reload', async ({ page }) => {
    await registerAndLogin(page, 'clear-note');
    const headers = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Clear Fields ${Date.now()}` },
      headers,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    const noteRes = await page.request.post(`${BACKEND}/api/notes`, {
      data: { campaignId, title: 'Session 3 recap', content: 'Dragons.', sessionNumber: 3 },
      headers,
    });
    expect(noteRes.ok(), `note create failed: ${noteRes.status()}`).toBeTruthy();
    const noteId = (await noteRes.json()).id as string;

    await page.goto(`/campaigns/${campaignId}/notes/${noteId}`);
    await expect(page.getByText(/^Session 3$/)).toBeVisible();

    await page.getByRole('button', { name: /^edit$/i }).click();
    await page.getByLabel(/session number/i).clear();
    await page.getByRole('button', { name: /^save$/i }).click();

    await expect(page.getByRole('heading', { name: 'Session 3 recap' })).toBeVisible();
    await expect(page.getByText(/^Session 3$/)).not.toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Session 3 recap' })).toBeVisible();
    await expect(page.getByText(/^Session 3$/)).not.toBeVisible();
  });

  test('clearing the profile email survives a reload', async ({ page }) => {
    await registerAndLogin(page, 'clear-email');
    const headers = await csrfHeaders(page);

    // Seed an email so there is something to clear.
    const seed = await page.request.patch(`${BACKEND}/api/users/me`, {
      data: { email: `clear-${Date.now()}@example.com` },
      headers,
    });
    expect(seed.ok(), `email seed failed: ${seed.status()}`).toBeTruthy();

    await page.goto('/profile');
    const email = page.getByLabel(/^email$/i);
    await expect(email).not.toHaveValue('');

    await email.clear();
    await page.getByRole('button', { name: /save changes/i }).click();
    await expect(page.getByText('Profile updated')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel(/^email$/i)).toHaveValue('');
  });
});
