import { expect, test } from '@playwright/test';
import { BACKEND, csrfHeaders, registerAndLogin } from './helpers';

// VEG-476: a character now persists `backgroundId` alongside the display name so a
// *loaded* character re-resolves its background by id — even when the name later
// collides with a homebrew background of the same name (VEG-473). Before this,
// the loaded character carried only the ambiguous name, so `resolveBackground`
// returned undefined and the editor suppressed the "Apply <bg> traits" autofill
// button. Only a real database proves the round-trip; unit specs mock Prisma.
test.describe('character background id round-trip (VEG-476)', () => {
  test('a loaded character resolves its background by id despite a duplicate-named homebrew row', async ({
    page,
  }) => {
    await registerAndLogin(page, 'bg-id', 'E2E Background Ider');

    // Author a homebrew "Acolyte" so the name collides with the SRD Acolyte.
    // Both rows now ride this owner's /srd/backgrounds catalog.
    const create = await page.request.post(`${BACKEND}/api/srd/backgrounds`, {
      data: { name: 'Acolyte', skillProficiencies: ['Stealth'] },
      headers: await csrfHeaders(page),
    });
    expect(create.status(), await create.text()).toBe(201);

    // ── Create a character, picking the *homebrew* Acolyte from the picker ──
    await page.goto('/characters/new');
    await page.getByLabel(/^name/i).fill('Loaded Acolyte');

    const bgInput = page.getByLabel(/^background/i);
    await bgInput.click();
    await bgInput.fill('Acolyte');
    // Colliding names are source-suffixed in the dropdown ("Acolyte (Homebrew)")
    // so the two otherwise-identical rows are distinguishable; the committed
    // value stays the bare name. Picking captures the unambiguous id.
    await page.getByRole('option', { name: 'Acolyte (Homebrew)' }).click();
    await expect(bgInput).toHaveValue('Acolyte');

    // The id resolved the exact row, so the autofill button is offered.
    const applyButton = page.getByRole('button', { name: /apply acolyte traits/i });
    await expect(applyButton).toBeVisible();

    await page.getByRole('button', { name: /create character/i }).click();
    await expect(page.getByRole('heading', { name: 'Loaded Acolyte' })).toBeVisible();

    // ── Reopen in the editor: the crux of VEG-476 ──────────────────────────
    // The character now carries only its persisted state. Its background name
    // ("Acolyte") is ambiguous — two rows share it — so a name-only load would
    // resolve to nothing and hide the autofill button. The persisted backgroundId
    // disambiguates it, so the button is present again.
    await page.getByRole('link', { name: /edit/i }).first().click();
    await expect(page.getByLabel(/^background/i)).toHaveValue('Acolyte');
    await expect(page.getByRole('button', { name: /apply acolyte traits/i })).toBeVisible();
  });
});
