import { test, expect } from '@playwright/test';
import { BACKEND, registerAndLogin, csrfHeaders } from './helpers';

// Total copper value of a Currency — the coin module re-denominates change
// optimally (100 gp becomes 10 pp), so assert on value, not a single denom.
type Coin = { cp: number; sp: number; ep: number; gp: number; pp: number };
const copper = (c: Coin) => c.pp * 1000 + c.gp * 100 + c.ep * 50 + c.sp * 10 + c.cp;

// VEG-357 — in-app purchasing. Drives the API directly (the Buy UI is a separate
// slice): a member buys a line item and coin/inventory/stock move atomically.
test.describe('Shop purchase', () => {
  test('a member buys an item: coin deducted, item in inventory, stock decremented', async ({
    page,
    browser,
  }) => {
    // DM sets up a campaign, an invite code, and a shop with finite stock.
    await registerAndLogin(page, 'buy-dm');
    const dmHeaders = await csrfHeaders(page);

    const campRes = await page.request.post(`${BACKEND}/api/campaigns`, {
      data: { name: `Buy Camp ${Date.now()}` },
      headers: dmHeaders,
    });
    expect(campRes.ok(), `campaign create failed: ${campRes.status()}`).toBeTruthy();
    const campaignId = (await campRes.json()).id as string;

    const inviteRes = await page.request.post(
      `${BACKEND}/api/campaigns/${campaignId}/invite-code`,
      { headers: dmHeaders }
    );
    const inviteCode = (await inviteRes.json()).inviteCode as string;

    const shopRes = await page.request.post(`${BACKEND}/api/shops`, {
      data: {
        campaignId,
        name: "Maelin's Apothecary",
        theme: 'alchemist',
        items: [{ name: 'Potion of Healing', category: 'Potion', price: { gp: 50 }, stock: 3 }],
      },
      headers: dmHeaders,
    });
    expect(shopRes.ok(), `shop create failed: ${shopRes.status()}`).toBeTruthy();
    const shopId = (await shopRes.json()).id as string;

    // A player joins and creates a character (attached to the campaign) with coin.
    const playerCtx = await browser.newContext();
    const playerPage = await playerCtx.newPage();
    await registerAndLogin(playerPage, 'buy-player', 'E2E Buyer');
    const pHeaders = await csrfHeaders(playerPage);

    const joinRes = await playerPage.request.post(`${BACKEND}/api/campaigns/join/${inviteCode}`, {
      headers: pHeaders,
    });
    expect(joinRes.ok(), `join failed: ${joinRes.status()}`).toBeTruthy();

    const charRes = await playerPage.request.post(`${BACKEND}/api/characters`, {
      data: {
        name: 'Mialee Buyer',
        campaignId,
        currency: { gp: 150 },
        abilityScores: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
        hitPoints: { max: 10, current: 10, temporary: 0 },
        armorClass: 10,
        speed: 30,
      },
      headers: pHeaders,
    });
    expect(charRes.ok(), `character create failed: ${charRes.status()}`).toBeTruthy();
    const characterId = (await charRes.json()).id as string;

    // Buy 1 potion: 50 gp spent, stock 3 -> 2, shop version 0 -> 1.
    const buyRes = await playerPage.request.post(`${BACKEND}/api/shops/${shopId}/purchase`, {
      data: { characterId, itemIndex: 0, quantity: 1 },
      headers: pHeaders,
    });
    expect(buyRes.ok(), `purchase failed: ${buyRes.status()}`).toBeTruthy();
    const receipt = await buyRes.json();
    expect(copper(receipt.newBalance)).toBe(10_000); // 150 gp − 50 gp = 100 gp
    expect(receipt.remainingStock).toBe(2);
    expect(receipt.shopVersion).toBe(1);
    expect(receipt.item).toMatchObject({ name: 'Potion of Healing', quantity: 1 });

    // Character holds the potion and spent the coin.
    const character = await (
      await playerPage.request.get(`${BACKEND}/api/characters/${characterId}`, {
        headers: pHeaders,
      })
    ).json();
    expect(copper(character.currency)).toBe(10_000);
    const potion = (character.inventory as Array<{ name: string; quantity: number }>).find(
      i => i.name === 'Potion of Healing'
    );
    expect(potion?.quantity).toBe(1);

    // Shop stock decremented.
    const shop = await (
      await playerPage.request.get(`${BACKEND}/api/shops/${shopId}`, { headers: pHeaders })
    ).json();
    expect(shop.items[0].stock).toBe(2);

    // A stale optimistic-lock version is rejected (409) — proves the version
    // guard fires against the real DB, not just the mocked count===0 unit test.
    // Funds and stock are both sufficient here, so this can only be the guard.
    const staleRes = await playerPage.request.post(`${BACKEND}/api/shops/${shopId}/purchase`, {
      data: { characterId, itemIndex: 0, quantity: 1, expectedShopVersion: 0 },
      headers: pHeaders,
    });
    expect(staleRes.status()).toBe(409);

    // Overselling the remaining stock is rejected (stock 2, asking 99).
    const oversellRes = await playerPage.request.post(`${BACKEND}/api/shops/${shopId}/purchase`, {
      data: { characterId, itemIndex: 0, quantity: 99 },
      headers: pHeaders,
    });
    expect(oversellRes.status()).toBe(400);

    // Buy the last 2 (100 gp, exactly the purse), then a broke buy is rejected.
    const buyRest = await playerPage.request.post(`${BACKEND}/api/shops/${shopId}/purchase`, {
      data: { characterId, itemIndex: 0, quantity: 2 },
      headers: pHeaders,
    });
    expect(buyRest.ok(), `final purchase failed: ${buyRest.status()}`).toBeTruthy();

    const brokeRes = await playerPage.request.post(`${BACKEND}/api/shops/${shopId}/purchase`, {
      data: { characterId, itemIndex: 0, quantity: 1 },
      headers: pHeaders,
    });
    expect(brokeRes.status()).toBe(400);

    await playerCtx.close();
  });
});
