import { test, expect } from '@playwright/test';
import { BACKEND, registerAndLogin, csrfHeaders } from './helpers';

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
        currency: { gp: 100 },
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

    // Buy 2 potions for 100 gp total — exactly the purse.
    const buyRes = await playerPage.request.post(`${BACKEND}/api/shops/${shopId}/purchase`, {
      data: { characterId, itemIndex: 0, quantity: 2 },
      headers: pHeaders,
    });
    expect(buyRes.ok(), `purchase failed: ${buyRes.status()}`).toBeTruthy();
    const receipt = await buyRes.json();
    expect(receipt.newBalance.gp).toBe(0);
    expect(receipt.remainingStock).toBe(1);
    expect(receipt.item).toMatchObject({ name: 'Potion of Healing', quantity: 2 });

    // Character now holds the potions and has spent the coin.
    const charAfter = await playerPage.request.get(`${BACKEND}/api/characters/${characterId}`, {
      headers: pHeaders,
    });
    const character = await charAfter.json();
    expect(character.currency.gp).toBe(0);
    const potion = (character.inventory as Array<{ name: string; quantity: number }>).find(
      i => i.name === 'Potion of Healing'
    );
    expect(potion?.quantity).toBe(2);

    // Shop stock decremented.
    const shopAfter = await playerPage.request.get(`${BACKEND}/api/shops/${shopId}`, {
      headers: pHeaders,
    });
    const shop = await shopAfter.json();
    expect(shop.items[0].stock).toBe(1);

    // A second purchase that can't be afforded is rejected, leaving stock intact.
    const brokeRes = await playerPage.request.post(`${BACKEND}/api/shops/${shopId}/purchase`, {
      data: { characterId, itemIndex: 0, quantity: 1 },
      headers: pHeaders,
    });
    expect(brokeRes.status()).toBe(400);

    // Overselling the remaining stock is rejected too.
    const oversellRes = await playerPage.request.post(`${BACKEND}/api/shops/${shopId}/purchase`, {
      data: { characterId, itemIndex: 0, quantity: 99 },
      headers: pHeaders,
    });
    expect(oversellRes.status()).toBe(400);

    await playerCtx.close();
  });
});
