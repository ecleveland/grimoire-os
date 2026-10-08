import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { BACKEND, createEncounter, csrfHeaders } from './helpers';

const E2E_DB_NAME = process.env.E2E_DB_NAME ?? 'grimoire_os_e2e';
const PASSWORD = 'TestPass1!';

// Run a single SQL statement inside the compose postgres container (no host psql).
function sql(query: string): string {
  const repoRoot = path.resolve(__dirname, '..');
  const cmd = [
    'docker compose',
    '-f',
    `"${path.join(repoRoot, 'docker-compose.yml')}"`,
    'exec -T postgres',
    'psql -U grimoire',
    `-d ${E2E_DB_NAME}`,
    '-tA -v ON_ERROR_STOP=1',
    `-c "${query}"`,
  ].join(' ');
  return execSync(cmd, { stdio: 'pipe' }).toString().trim();
}

// Register via page.request so the Set-Cookie authenticates later navigations.
async function register(page: Page, prefix: string): Promise<string> {
  const username = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: PASSWORD, displayName: `E2E ${prefix}` },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
  return username;
}

async function newUser(
  browser: Browser,
  prefix: string
): Promise<{ page: Page; username: string }> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const username = await register(page, prefix);
  return { page, username };
}

async function registerAdmin(page: Page): Promise<void> {
  const username = await register(page, 'roleadmin');
  sql(`UPDATE users SET role = 'admin' WHERE username = '${username}'`);
  const login = await page.request.post(`${BACKEND}/api/auth/login`, {
    data: { username, password: PASSWORD },
  });
  expect(login.ok(), `admin re-login failed: ${login.status()}`).toBeTruthy();
}

// Open the first SRD monster's stat block. Its "Add to encounter" button only
// renders for a dungeon_master or admin.
async function openFirstMonster(page: Page): Promise<void> {
  await page.goto('/srd/monsters');
  const firstCard = page.getByTestId('monster-card').first();
  await expect(firstCard).toBeVisible({ timeout: 10_000 });
  await firstCard.click();
  await expect(page.getByTestId('monster-stat-block')).toBeVisible();
}

test.describe('Role refusal (VEG-544)', () => {
  test('a player in the campaign sees the encounter but no controller controls, and the API refuses edits', async ({
    page,
    browser,
  }) => {
    await register(page, 'roledm');
    const { campaignId, encounterId } = await createEncounter(page, 'Roles');
    const encounterUrl = `/campaigns/${campaignId}/encounters/${encounterId}`;

    // The DM sees the controls, which proves the locators below are real.
    await page.goto(encounterUrl);
    await expect(page.getByRole('heading', { name: 'Goblin Ambush' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole('button', { name: 'Start Combat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add combatant' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Damage Hero' })).toBeVisible();

    const inviteRes = await page.request.post(
      `${BACKEND}/api/campaigns/${campaignId}/invite-code`,
      { headers: await csrfHeaders(page) }
    );
    expect(inviteRes.ok(), `invite code failed: ${inviteRes.status()}`).toBeTruthy();
    const inviteCode = (await inviteRes.json()).inviteCode as string;

    const { page: player } = await newUser(browser, 'roleplayer');
    const join = await player.request.post(`${BACKEND}/api/campaigns/join/${inviteCode}`, {
      headers: await csrfHeaders(player),
    });
    expect(join.ok(), `join failed: ${join.status()}`).toBeTruthy();

    await player.goto(encounterUrl);
    await expect(player.getByRole('heading', { name: 'Goblin Ambush' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(player.getByText('Hero', { exact: true }).first()).toBeVisible();
    await expect(player.getByRole('button', { name: 'Start Combat' })).toHaveCount(0);
    await expect(player.getByRole('button', { name: 'Add combatant' })).toHaveCount(0);
    await expect(player.getByRole('button', { name: 'Damage Hero' })).toHaveCount(0);
    await expect(player.getByRole('button', { name: 'Remove Hero' })).toHaveCount(0);

    const patch = await player.request.patch(`${BACKEND}/api/encounters/${encounterId}`, {
      data: { isActive: true },
      headers: await csrfHeaders(player),
    });
    expect(patch.status()).toBe(403);

    await player.context().close();
  });

  test('a player is redirected away from /admin/users and refused by the admin API', async ({
    page,
  }) => {
    await register(page, 'roleplayer');

    await page.goto('/admin/users');
    await page.waitForURL(/\/$|\/dashboard/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: 'User Management' })).toHaveCount(0);

    const list = await page.request.get(`${BACKEND}/api/admin/users`);
    expect(list.status()).toBe(403);
  });

  test('an admin promotes a player to Dungeon Master and the player gains the DM affordance', async ({
    page,
    browser,
  }) => {
    const { page: player, username } = await newUser(browser, 'rolepromo');

    // Before: a player gets no "Add to encounter" on a monster stat block.
    await openFirstMonster(player);
    await expect(player.getByRole('button', { name: 'Add to encounter' })).toHaveCount(0);

    await registerAdmin(page);
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'User Management' })).toBeVisible({
      timeout: 10_000,
    });

    // Users list newest first, so the fresh player is on the first page.
    const row = page.getByRole('row').filter({ hasText: username });
    await expect(row).toBeVisible();
    await row.getByRole('combobox').selectOption({ label: 'Dungeon Master' });
    await expect(page.getByText('Role updated')).toBeVisible();

    // The JWT strategy reads the role from the user row, so a reload picks up
    // the promotion without a new login.
    const me = await player.request.get(`${BACKEND}/api/users/me`);
    expect(me.ok(), `users/me failed: ${me.status()}`).toBeTruthy();
    expect((await me.json()).role).toBe('dungeon_master');

    await openFirstMonster(player);
    await expect(player.getByRole('button', { name: 'Add to encounter' })).toBeVisible();

    await player.context().close();
  });
});
