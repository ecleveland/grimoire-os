import { expect, test, type Page } from '@playwright/test';

const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

async function registerPlayer(page: Page): Promise<void> {
  const username = `cache-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName: 'Cache User' },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

// A unique `q` per call gives a fresh cache key, so the first hit is a
// guaranteed MISS regardless of what other tests/requests have cached.
function uniqueUrl(): string {
  return `${BACKEND}/api/srd/monsters?q=cachetest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Anonymous SRD response caching (VEG-333). The owner-aware monster route now
// caches anonymous (catalog-only) responses by URL while bypassing authenticated
// ones, so one user's homebrew can never be served from a shared cache entry.
// The inherited CacheInterceptor stamps X-Cache: MISS/HIT on the cached path and
// nothing on the bypassed path — a clean signal to assert end to end.
test.describe('Anonymous SRD response caching (VEG-333)', () => {
  test('caches an anonymous GET /srd/monsters and serves the repeat from cache', async ({
    page,
  }) => {
    const url = uniqueUrl();

    const first = await page.request.get(url);
    expect(first.ok()).toBeTruthy();
    expect(first.headers()['x-cache']).toBe('MISS');

    const second = await page.request.get(url);
    expect(second.ok()).toBeTruthy();
    expect(second.headers()['x-cache']).toBe('HIT');
  });

  test('bypasses the cache for an authenticated caller (no shared entry, no cache header)', async ({
    page,
  }) => {
    await registerPlayer(page); // page.request now carries the auth cookies
    const url = uniqueUrl();

    const first = await page.request.get(url);
    expect(first.ok()).toBeTruthy();
    // Authenticated requests skip the interceptor entirely — no cache stamp...
    expect(first.headers()['x-cache']).toBeUndefined();

    // ...and a second authenticated hit is never served from a cache either.
    const second = await page.request.get(url);
    expect(second.ok()).toBeTruthy();
    expect(second.headers()['x-cache']).toBeUndefined();
  });
});
