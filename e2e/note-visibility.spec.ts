import { expect, test, type Browser, type Page } from '@playwright/test';
import { BACKEND, createCampaign, csrfHeaders, registerAndLogin } from './helpers';

type Visibility = 'private' | 'party' | 'dm_only';

// Fill and submit the new-note form, then wait for the redirect to the note.
async function createNoteViaForm(
  page: Page,
  campaignId: string,
  title: string,
  visibility: 'Private' | 'Party' | 'DM Only'
): Promise<void> {
  await page.goto(`/campaigns/${campaignId}/notes/new`);
  await expect(page.getByRole('heading', { name: 'Create Note' })).toBeVisible({
    timeout: 10_000,
  });
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Content').fill(`Body of ${title}`);
  await page.getByLabel('Visibility').selectOption({ label: visibility });
  await page.getByRole('button', { name: 'Create Note' }).click();
  await expect(page).toHaveURL(new RegExp(`/campaigns/${campaignId}/notes/(?!new)[\\w-]+$`), {
    timeout: 10_000,
  });
}

async function createNoteViaApi(
  page: Page,
  campaignId: string,
  title: string,
  visibility: Visibility
): Promise<string> {
  const res = await page.request.post(`${BACKEND}/api/notes`, {
    data: { campaignId, title, content: `Body of ${title}`, visibility },
    headers: await csrfHeaders(page),
  });
  expect(res.ok(), `note create failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).id as string;
}

async function listNoteTitles(page: Page, campaignId: string): Promise<string[]> {
  const res = await page.request.get(`${BACKEND}/api/notes?campaignId=${campaignId}`);
  expect(res.ok(), `note list failed: ${res.status()}`).toBeTruthy();
  return ((await res.json()).data as { title: string }[]).map(n => n.title).sort();
}

async function openNotesTab(page: Page, campaignId: string): Promise<void> {
  await page.goto(`/campaigns/${campaignId}`);
  await page.getByRole('button', { name: 'Notes', exact: true }).click({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
}

// A fresh user in its own browser context, so its cookies stay separate.
async function newUser(browser: Browser, prefix: string, displayName: string): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await registerAndLogin(page, prefix, displayName);
  return page;
}

async function joinCampaign(dm: Page, member: Page, campaignId: string): Promise<void> {
  const inviteRes = await dm.request.post(`${BACKEND}/api/campaigns/${campaignId}/invite-code`, {
    headers: await csrfHeaders(dm),
  });
  expect(inviteRes.ok(), `invite code failed: ${inviteRes.status()}`).toBeTruthy();
  const inviteCode = (await inviteRes.json()).inviteCode as string;

  const joinRes = await member.request.post(`${BACKEND}/api/campaigns/join/${inviteCode}`, {
    headers: await csrfHeaders(member),
  });
  expect(joinRes.ok(), `join failed: ${joinRes.status()}`).toBeTruthy();
}

// The DM's three notes, one per visibility, created through the API.
async function seedDmNotes(dm: Page, campaignId: string, tag: string) {
  const titles = {
    private: `DM Private ${tag}`,
    party: `DM Party ${tag}`,
    dmOnly: `DM Only ${tag}`,
  };
  const ids = {
    private: await createNoteViaApi(dm, campaignId, titles.private, 'private'),
    party: await createNoteViaApi(dm, campaignId, titles.party, 'party'),
    dmOnly: await createNoteViaApi(dm, campaignId, titles.dmOnly, 'dm_only'),
  };
  return { titles, ids };
}

test.describe('Note visibility (VEG-544)', () => {
  test('the DM creates a note of each visibility through the form and sees all three', async ({
    page,
  }) => {
    await registerAndLogin(page, 'notedm', 'E2E Note DM');
    const campaignId = await createCampaign(page, 'Notes');
    const tag = Date.now();
    const titles = [`DM Private ${tag}`, `DM Party ${tag}`, `DM Only ${tag}`];

    await createNoteViaForm(page, campaignId, titles[0], 'Private');
    await createNoteViaForm(page, campaignId, titles[1], 'Party');
    await createNoteViaForm(page, campaignId, titles[2], 'DM Only');

    await openNotesTab(page, campaignId);
    for (const title of titles) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible();
    }
  });

  test('a party member sees party notes and their own private note, never the DM private or DM-only notes', async ({
    page,
    browser,
  }) => {
    await registerAndLogin(page, 'notedm', 'E2E Note DM');
    const campaignId = await createCampaign(page, 'Notes');
    const tag = Date.now();
    const { titles } = await seedDmNotes(page, campaignId, tag);

    const member = await newUser(browser, 'notemember', 'E2E Note Member');
    await joinCampaign(page, member, campaignId);
    const ownTitle = `Member Private ${tag}`;
    await createNoteViaForm(member, campaignId, ownTitle, 'Private');

    await openNotesTab(member, campaignId);
    await expect(member.getByRole('heading', { name: titles.party })).toBeVisible();
    await expect(member.getByRole('heading', { name: ownTitle })).toBeVisible();
    await expect(member.getByRole('heading', { name: titles.private })).toHaveCount(0);
    await expect(member.getByRole('heading', { name: titles.dmOnly })).toHaveCount(0);

    expect(await listNoteTitles(member, campaignId)).toEqual([titles.party, ownTitle].sort());

    await member.context().close();
  });

  test('the DM sees every note in the campaign through the API, including a member private note', async ({
    page,
    browser,
  }) => {
    await registerAndLogin(page, 'notedm', 'E2E Note DM');
    const campaignId = await createCampaign(page, 'Notes');
    const tag = Date.now();
    const { titles } = await seedDmNotes(page, campaignId, tag);

    const member = await newUser(browser, 'notemember', 'E2E Note Member');
    await joinCampaign(page, member, campaignId);
    const ownTitle = `Member Private ${tag}`;
    await createNoteViaApi(member, campaignId, ownTitle, 'private');

    expect(await listNoteTitles(page, campaignId)).toEqual(
      [titles.private, titles.party, titles.dmOnly, ownTitle].sort()
    );

    await member.context().close();
  });

  test('a non-member is refused a party note and the campaign note list with 403', async ({
    page,
    browser,
  }) => {
    await registerAndLogin(page, 'notedm', 'E2E Note DM');
    const campaignId = await createCampaign(page, 'Notes');
    const { ids } = await seedDmNotes(page, campaignId, Date.now());

    const outsider = await newUser(browser, 'noteoutsider', 'E2E Note Outsider');

    const one = await outsider.request.get(`${BACKEND}/api/notes/${ids.party}`);
    expect(one.status()).toBe(403);

    const list = await outsider.request.get(`${BACKEND}/api/notes?campaignId=${campaignId}`);
    expect(list.status()).toBe(403);

    await outsider.context().close();
  });
});
