import { expect, type Page } from '@playwright/test';

export const BACKEND = process.env.E2E_API_URL ?? 'http://localhost:3001';

/** Escape regex metacharacters so a display name can be matched literally. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Register via page.request so the Set-Cookie authenticates later navigations.
export async function registerAndLogin(
  page: Page,
  prefix = 'e2e',
  displayName = 'E2E DM'
): Promise<void> {
  const username = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: 'TestPass1!', displayName },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
}

// Mutating endpoints enforce the CSRF double-submit cookie (VEG-277): read the
// non-httpOnly csrf_token cookie and echo it back in the x-csrf-token header.
export async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const csrf = (await page.context().cookies()).find(c => c.name === 'csrf_token');
  expect(csrf?.value, 'csrf_token cookie missing').toBeTruthy();
  return { 'x-csrf-token': csrf!.value };
}

// Create a campaign plus a "Goblin Ambush" encounter with a single Hero
// combatant — the shared fixture for the encounter-tracker specs.
export async function createEncounter(
  page: Page,
  campaignPrefix = 'Camp'
): Promise<{ campaignId: string; encounterId: string }> {
  const headers = await csrfHeaders(page);

  const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
    data: { name: `${campaignPrefix} ${Date.now()}` },
    headers,
  });
  expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
  const campaignId = (await campRes.json()).id as string;

  const encRes = await page.request.post(`${BACKEND}/api/encounters`, {
    data: {
      campaignId,
      name: 'Goblin Ambush',
      combatants: [{ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, ac: 16, isNpc: false }],
    },
    headers,
  });
  expect(encRes.ok(), `encounter create failed: ${encRes.status()}`).toBeTruthy();
  const encounterId = (await encRes.json()).id as string;

  return { campaignId, encounterId };
}
