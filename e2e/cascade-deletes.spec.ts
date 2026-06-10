import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { csrfHeaders, BACKEND } from './helpers';

// VEG-312: RESTRICT FKs made deleting any non-empty campaign (or any user who
// owned content) fail with a P2003, which AllExceptionsFilter surfaced as a
// 400 carrying the raw Prisma FK-constraint message. These specs exercise the
// real Postgres cascade rules end-to-end — the backend unit suite mocks Prisma
// and is structurally unable to catch FK behavior.

const E2E_DB_NAME = process.env.E2E_DB_NAME ?? 'grimoire_os_e2e';
const PASSWORD = 'TestPass1!';

// Run a single SQL statement inside the compose postgres container — the same
// path global-setup.ts uses, so no host-side psql client is needed.
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

async function register(page: Page, prefix: string): Promise<string> {
  const username = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const reg = await page.request.post(`${BACKEND}/api/auth/register`, {
    data: { username, password: PASSWORD, displayName: `E2E ${prefix}` },
  });
  expect(reg.ok(), `register failed: ${reg.status()}`).toBeTruthy();
  return username;
}

// Create a campaign holding one note, one encounter, and one NPC — the three
// child models whose FKs previously blocked campaign deletion.
async function createPopulatedCampaign(
  page: Page,
  headers: Record<string, string>
): Promise<string> {
  const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
    data: { name: `Doomed ${Date.now()}` },
    headers,
  });
  expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
  const campaignId = (await campRes.json()).id as string;

  const noteRes = await page.request.post(`${BACKEND}/api/notes`, {
    data: { campaignId, title: 'Session 0 plans' },
    headers,
  });
  expect(noteRes.ok(), `note create failed: ${noteRes.status()}`).toBeTruthy();

  const encRes = await page.request.post(`${BACKEND}/api/encounters`, {
    data: {
      campaignId,
      name: 'Goblin Ambush',
      combatants: [{ name: 'Hero', initiative: 18, hp: 24, maxHp: 24, ac: 16, isNpc: false }],
    },
    headers,
  });
  expect(encRes.ok(), `encounter create failed: ${encRes.status()}`).toBeTruthy();

  const npcRes = await page.request.post(`${BACKEND}/api/npcs`, {
    data: { campaignId, name: 'Old Maelin', race: 'Human' },
    headers,
  });
  expect(npcRes.ok(), `npc create failed: ${npcRes.status()}`).toBeTruthy();

  return campaignId;
}

function countChildren(campaignId: string): { notes: string; encounters: string; npcs: string } {
  return {
    notes: sql(`SELECT count(*) FROM notes WHERE \\"campaignId\\" = '${campaignId}'`),
    encounters: sql(`SELECT count(*) FROM encounters WHERE \\"campaignId\\" = '${campaignId}'`),
    npcs: sql(`SELECT count(*) FROM npcs WHERE \\"campaignId\\" = '${campaignId}'`),
  };
}

test.describe('Cascade deletes (VEG-312)', () => {
  test('deleting a campaign with notes, encounters, and NPCs succeeds and removes its content', async ({
    page,
  }) => {
    await register(page, 'dm');
    const headers = await csrfHeaders(page);
    const campaignId = await createPopulatedCampaign(page, headers);

    // Pre-cascade sanity: the children exist in the database.
    expect(countChildren(campaignId)).toEqual({ notes: '1', encounters: '1', npcs: '1' });

    // Previously: P2003 → raw FK-constraint 400. Now: clean 204.
    const del = await page.request.delete(`${BACKEND}/api/campaigns/${campaignId}`, { headers });
    expect(del.status()).toBe(204);

    const gone = await page.request.get(`${BACKEND}/api/campaigns/${campaignId}`);
    expect(gone.status()).toBe(404);
    expect(countChildren(campaignId)).toEqual({ notes: '0', encounters: '0', npcs: '0' });
  });

  test('admin can delete a user who owns a campaign, character, and content', async ({
    page,
    browser,
  }) => {
    // The future admin first acts as a second DM: their campaign must survive
    // the victim's deletion, losing only the rows the victim authored in it.
    const adminName = await register(page, 'admin');
    const adminHeaders = await csrfHeaders(page);
    const dm2CampRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Survivor ${Date.now()}` },
      headers: adminHeaders,
    });
    expect(dm2CampRes.ok(), `dm2 campaign create failed: ${dm2CampRes.status()}`).toBeTruthy();
    const dm2CampaignId = (await dm2CampRes.json()).id as string;
    const dm2NoteRes = await page.request.post(`${BACKEND}/api/notes`, {
      data: { campaignId: dm2CampaignId, title: 'DM2 own note' },
      headers: adminHeaders,
    });
    expect(dm2NoteRes.ok(), `dm2 note create failed: ${dm2NoteRes.status()}`).toBeTruthy();
    const inviteRes = await page.request.post(
      `${BACKEND}/api/campaigns/${dm2CampaignId}/invite-code`,
      { headers: adminHeaders }
    );
    expect(inviteRes.ok(), `invite code failed: ${inviteRes.status()}`).toBeTruthy();
    const inviteCode = (await inviteRes.json()).inviteCode as string;

    // The victim builds out a populated campaign plus a standalone character,
    // then joins DM2's campaign and authors a note there — isolating the
    // authorId cascade from the ownerId → campaign → children chain.
    const victimCtx = await browser.newContext();
    const victimPage = await victimCtx.newPage();
    const victimName = await register(victimPage, 'victim');
    const victimHeaders = await csrfHeaders(victimPage);
    const campaignId = await createPopulatedCampaign(victimPage, victimHeaders);
    const charRes = await victimPage.request.post(`${BACKEND}/api/characters`, {
      data: { name: 'Thorin Ironforge' },
      headers: victimHeaders,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();
    const joinRes = await victimPage.request.post(`${BACKEND}/api/campaigns/join/${inviteCode}`, {
      headers: victimHeaders,
    });
    expect(joinRes.ok(), `join failed: ${joinRes.status()}`).toBeTruthy();
    const foreignNoteRes = await victimPage.request.post(`${BACKEND}/api/notes`, {
      data: { campaignId: dm2CampaignId, title: 'Victim note in foreign campaign' },
      headers: victimHeaders,
    });
    expect(foreignNoteRes.ok(), `foreign note failed: ${foreignNoteRes.status()}`).toBeTruthy();
    const me = await victimPage.request.get(`${BACKEND}/api/users/me`);
    const victimId = (await me.json()).id as string;
    await victimCtx.close();

    // Promote the second DM to admin directly in the DB (no admin-creation
    // endpoint exists), then re-login so the JWT carries the admin role.
    sql(`UPDATE users SET role = 'admin' WHERE username = '${adminName}'`);
    const login = await page.request.post(`${BACKEND}/api/auth/login`, {
      data: { username: adminName, password: PASSWORD },
    });
    expect(login.ok(), `admin re-login failed: ${login.status()}`).toBeTruthy();
    const freshAdminHeaders = await csrfHeaders(page);

    // Previously: any owned content → P2003 → raw FK-constraint 400. Now: clean 204.
    const del = await page.request.delete(`${BACKEND}/api/admin/users/${victimId}`, {
      headers: freshAdminHeaders,
    });
    expect(del.status()).toBe(204);

    // The user and everything they created are gone.
    expect(sql(`SELECT count(*) FROM users WHERE id = '${victimId}'`)).toBe('0');
    expect(sql(`SELECT count(*) FROM campaigns WHERE \\"ownerId\\" = '${victimId}'`)).toBe('0');
    expect(sql(`SELECT count(*) FROM characters WHERE \\"userId\\" = '${victimId}'`)).toBe('0');
    expect(countChildren(campaignId)).toEqual({ notes: '0', encounters: '0', npcs: '0' });

    // DM2's campaign survives, keeping DM2's own note but not the victim's —
    // the authorId cascade removed exactly the victim's row. Of the two
    // membership rows (campaign creation enrolls the owner), only the owner's
    // remains after the victim's CampaignPlayer row cascades.
    const dm2Campaign = await page.request.get(`${BACKEND}/api/campaigns/${dm2CampaignId}`);
    expect(dm2Campaign.status()).toBe(200);
    expect(sql(`SELECT count(*) FROM notes WHERE \\"campaignId\\" = '${dm2CampaignId}'`)).toBe('1');
    expect(sql(`SELECT count(*) FROM notes WHERE \\"authorId\\" = '${victimId}'`)).toBe('0');
    expect(
      sql(`SELECT count(*) FROM campaign_players WHERE \\"campaignId\\" = '${dm2CampaignId}'`)
    ).toBe('1');
    expect(
      sql(
        `SELECT count(*) FROM campaign_players WHERE \\"campaignId\\" = '${dm2CampaignId}' AND \\"userId\\" = '${victimId}'`
      )
    ).toBe('0');

    // The deleted account can no longer authenticate.
    const ghostLogin = await page.request.post(`${BACKEND}/api/auth/login`, {
      data: { username: victimName, password: PASSWORD },
    });
    expect(ghostLogin.status()).toBe(401);
  });
});
