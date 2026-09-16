import { expect, test } from '@playwright/test';
import { BACKEND, registerAndLogin } from './helpers';

// Logout leaves by a full page load (VEG-559). Clearing the query cache in place
// re-rendered the private page that was still mounted, its queries refetched
// with the cookies already gone, and the 401 walked apiFetch through a refresh
// and a second logout.
test.describe('Logout', () => {
  test('leaves a class page for /login without refetching or refreshing', async ({ page }) => {
    await registerAndLogin(page, 'logout-ui', 'E2E Logout');

    const res = await page.request.get(`${BACKEND}/api/srd/classes`);
    expect(res.ok(), `class list failed: ${res.status()}`).toBeTruthy();
    const classes = (await res.json()) as { id: string; name: string; contentSource: string }[];
    const fighter = classes.find(c => c.name === 'Fighter' && c.contentSource === 'srd');
    expect(fighter, 'seeded SRD Fighter missing').toBeTruthy();
    const fighterId = fighter!.id;

    await page.goto(`/srd/classes/${fighterId}`);
    await expect(page.getByRole('heading', { level: 1, name: /Fighter/ })).toBeVisible({
      timeout: 10_000,
    });

    // Recording starts only once the page has settled, so the reads that loaded
    // it don't count against the assertions below.
    const classPageUrl = page.url();
    const requests: { method: string; url: string; from: string }[] = [];
    page.on('request', req =>
      requests.push({ method: req.method(), url: req.url(), from: req.frame().url() })
    );

    await page.getByRole('button', { name: 'Logout', exact: true }).click();

    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

    // Scoped to requests the class page itself sent. The full page load remounts
    // AuthProvider on /login, whose own hydration does GET /users/me, takes a 401
    // and POSTs /auth/refresh, so a page-wide count of those would be a race with
    // the new document rather than a statement about what logging out did here.
    const fromClassPage = requests.filter(r => r.from === classPageUrl);

    expect(fromClassPage.filter(r => r.url.endsWith('/auth/refresh'))).toHaveLength(0);
    const logouts = fromClassPage.filter(
      r => r.method === 'POST' && r.url.endsWith('/auth/logout')
    );
    expect(logouts).toHaveLength(1);

    // The refetch the bug caused, fired by the class page while it was still
    // mounted with the cookies already cleared.
    const afterLogout = fromClassPage.slice(fromClassPage.indexOf(logouts[0]) + 1);
    expect(afterLogout.filter(r => r.url.includes(`/api/srd/classes/${fighterId}`))).toHaveLength(
      0
    );
  });
});
