// Real-DB regression tests for the catalog-only rule on shop lines (VEG-556).
// The unit specs mock Prisma, so they prove the services *ask* for srd + shared
// and nothing more. Whether a homebrew row actually fails to resolve is a
// property of the where clause against real rows, and only a database tests a
// where clause. Two homebrew items exist here on purpose: the DM's own and a
// stranger's. The write boundary refuses both, because whoever buys the line
// later may not be the item's owner. The purchase path is scoped to the actual
// buyer instead, so it keeps an id that buyer can read and drops one they
// cannot. That is why the DM's own homebrew is refused on write yet survives a
// purchase the DM makes themselves. No stored pre-rule id survives to reach
// either path: the VEG-564 backfill nulled them, and shop-line-backfill.db-spec
// covers it. The retired-item update cases and the purchase cases below write
// the id straight through Prisma to model one that changed under a stocked
// line, such as a deleted item.
import type { Prisma } from '@prisma/client';
import type { Currency, InventoryItem, ShopLineItem } from '@grimoire-os/shared';
import {
  createSeedContext,
  teardownSeedContext,
  truncateAll,
  type SeedContext,
} from './db-harness';
import { ContentAccessService } from '../../src/srd/content-access.service';
import { CampaignAuthService } from '../../src/auth/campaign-auth.service';
import { ShopsService } from '../../src/shops/shops.service';
import { ShopPurchaseService } from '../../src/shops/shop-purchase.service';
import { HOMEBREW_SOURCE_LABEL } from '../../src/srd/homebrew-write.helpers';

const zero: Currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
const gp = (n: number): Currency => ({ ...zero, gp: n });
const asJson = (value: unknown) => value as Prisma.InputJsonValue;

describe('catalog-only shop lines on a real DB (VEG-556)', () => {
  let ctx: SeedContext;
  let shops: ShopsService;
  let purchase: ShopPurchaseService;

  let dmId: string;
  let campaignId: string;
  let srdItemId: string;
  let sharedItemId: string;
  let dmHomebrewId: string;
  let strangerHomebrewId: string;

  const baseShop = () => ({ campaignId, name: "Maelin's Apothecary", theme: 'alchemist' });

  const line = (over: Partial<ShopLineItem> = {}): ShopLineItem => ({
    itemId: null,
    name: 'Elixir of Health',
    category: 'Potion',
    price: gp(1),
    stock: null,
    ...over,
  });

  // A shop that goes in through Prisma directly. The service refuses a homebrew
  // line, so writing the row outside the API is the only way to get a stored id
  // that dangles or that the buyer cannot read.
  const insertShop = (items: ShopLineItem[]) =>
    ctx.prisma.shop.create({
      data: {
        campaignId,
        createdById: dmId,
        name: 'Back Room',
        theme: 'alchemist',
        items: asJson(items),
      },
    });

  beforeAll(async () => {
    ctx = await createSeedContext();
    const { prisma } = ctx;
    await truncateAll(prisma);

    const contentAccess = new ContentAccessService();
    const campaignAuth = new CampaignAuthService(prisma);
    shops = new ShopsService(prisma, campaignAuth, contentAccess);
    purchase = new ShopPurchaseService(prisma, campaignAuth, contentAccess);

    const [dm, stranger] = await Promise.all([
      prisma.user.create({
        data: { username: `veg556-dm-${Date.now()}`, passwordHash: 'x', displayName: 'DM' },
      }),
      prisma.user.create({
        data: { username: `veg556-other-${Date.now()}`, passwordHash: 'x', displayName: 'Other' },
      }),
    ]);
    dmId = dm.id;

    const campaign = await prisma.campaign.create({
      data: { name: 'Catalog Rules', ownerId: dmId },
    });
    campaignId = campaign.id;

    const homebrew = (createdById: string) =>
      ({ contentSource: 'homebrew', createdById, source: HOMEBREW_SOURCE_LABEL }) as const;
    const [srdItem, sharedItem, dmHomebrew, strangerHomebrew] = await Promise.all([
      prisma.item.create({
        data: { name: 'Elixir of Health', category: 'Potion', cost: '120 GP' },
      }),
      // Shared rows need no creator; the ownership CHECK constrains homebrew only.
      prisma.item.create({
        data: {
          name: 'Tonic of Vigour',
          category: 'Potion',
          cost: '75 GP',
          contentSource: 'shared',
        },
      }),
      prisma.item.create({
        data: { name: "Maelin's Own Brew", category: 'Potion', cost: '5 GP', ...homebrew(dmId) },
      }),
      prisma.item.create({
        data: {
          name: 'Smuggled Draught',
          category: 'Potion',
          cost: '1 GP',
          ...homebrew(stranger.id),
        },
      }),
    ]);
    srdItemId = srdItem.id;
    sharedItemId = sharedItem.id;
    dmHomebrewId = dmHomebrew.id;
    strangerHomebrewId = strangerHomebrew.id;
  }, 60_000);

  afterAll(async () => {
    if (ctx) await teardownSeedContext(ctx);
  });

  describe('create', () => {
    it('stocks SRD and shared items and persists both ids', async () => {
      const shop = await shops.create(dmId, {
        ...baseShop(),
        items: [
          { itemId: srdItemId, name: 'Elixir of Health', category: 'Potion', price: { gp: 120 } },
          { itemId: sharedItemId, name: 'Tonic of Vigour', category: 'Potion', price: { gp: 75 } },
        ],
      });

      const stored = await ctx.prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });
      const items = stored.items as unknown as ShopLineItem[];
      expect(items.map(i => i.itemId)).toEqual([srdItemId, sharedItemId]);
    });

    it("refuses the DM's own homebrew item", async () => {
      await expect(
        shops.create(dmId, {
          ...baseShop(),
          items: [
            {
              itemId: dmHomebrewId,
              name: "Maelin's Own Brew",
              category: 'Potion',
              price: { gp: 5 },
            },
          ],
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: [
            'Line "Maelin\'s Own Brew" links an item that is not in the SRD or shared catalog',
            expect.stringContaining('homebrew items are not eligible'),
          ],
        }),
      });
    });

    it('refuses a foreign homebrew item', async () => {
      await expect(
        shops.create(dmId, {
          ...baseShop(),
          items: [
            {
              itemId: strangerHomebrewId,
              name: 'Smuggled Draught',
              category: 'Potion',
              price: { gp: 1 },
            },
          ],
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: expect.arrayContaining([
            expect.stringContaining('homebrew items are not eligible'),
          ]),
        }),
      });
    });
  });

  describe('update', () => {
    it('refuses a homebrew item and leaves the stored stock untouched', async () => {
      const shop = await shops.create(dmId, {
        ...baseShop(),
        items: [
          { itemId: srdItemId, name: 'Elixir of Health', category: 'Potion', price: { gp: 120 } },
        ],
      });

      await expect(
        shops.update(shop.id, dmId, {
          items: [
            {
              itemId: strangerHomebrewId,
              name: 'Smuggled Draught',
              category: 'Potion',
              price: { gp: 1 },
            },
          ],
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: expect.arrayContaining([
            expect.stringContaining('homebrew items are not eligible'),
          ]),
        }),
      });

      const stored = await ctx.prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });
      const items = stored.items as unknown as ShopLineItem[];
      expect(items).toHaveLength(1);
      expect(items[0].itemId).toBe(srdItemId);
    });
    // An item can leave the catalog after a shop stocked it: an admin deletes a
    // shared item, or a re-seed retires an SRD one. The edit form resends every
    // line, so the dangling id must not block later saves of the shop.
    const stockThenRetire = async () => {
      const retired = await ctx.prisma.item.create({
        data: { name: 'Retired Tonic', category: 'Potion', cost: '9 GP', contentSource: 'shared' },
      });
      const shop = await insertShop([
        line({ itemId: retired.id, name: 'Retired Tonic', price: gp(9) }),
      ]);
      await ctx.prisma.item.delete({ where: { id: retired.id } });
      return { shop, retiredId: retired.id };
    };

    it('still saves a shop whose stored line names an item that left the catalog', async () => {
      const { shop, retiredId } = await stockThenRetire();

      const renamed = await shops.update(shop.id, dmId, {
        name: 'Renamed',
        items: [{ itemId: retiredId, name: 'Retired Tonic', category: 'Potion', price: gp(9) }],
      });

      expect(renamed.name).toBe('Renamed');
      const stored = await ctx.prisma.shop.findUniqueOrThrow({ where: { id: shop.id } });
      const items = stored.items as unknown as ShopLineItem[];
      expect(items[0].itemId).toBe(retiredId);
    });

    it('still refuses a new homebrew line added to that same shop', async () => {
      const { shop, retiredId } = await stockThenRetire();

      await expect(
        shops.update(shop.id, dmId, {
          items: [
            { itemId: retiredId, name: 'Retired Tonic', category: 'Potion', price: gp(9) },
            {
              itemId: dmHomebrewId,
              name: "Maelin's Own Brew",
              category: 'Potion',
              price: gp(5),
            },
          ],
        })
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          message: [
            'Line "Maelin\'s Own Brew" links an item that is not in the SRD or shared catalog',
            expect.stringContaining('homebrew items are not eligible'),
          ],
        }),
      });
    });
  });

  describe('purchase of a line whose id was written outside the API', () => {
    const insertBuyer = () =>
      ctx.prisma.character.create({
        data: { name: 'Buyer', userId: dmId, campaignId, currency: asJson(gp(10)), inventory: [] },
      });

    it('hands over the goods without the unreadable id', async () => {
      const shop = await insertShop([
        line({ itemId: strangerHomebrewId, name: 'Smuggled Draught', price: gp(1), stock: null }),
      ]);
      const character = await insertBuyer();

      const receipt = await purchase.purchase(dmId, shop.id, {
        characterId: character.id,
        itemIndex: 0,
        quantity: 1,
      });

      expect(receipt.item.itemId).toBeNull();
      const bought = await ctx.prisma.character.findUniqueOrThrow({ where: { id: character.id } });
      const inventory = bought.inventory as unknown as InventoryItem[];
      expect(inventory).toHaveLength(1);
      expect(inventory[0]).toMatchObject({ name: 'Smuggled Draught', quantity: 1 });
      expect(inventory[0].itemId ?? null).toBeNull();
    });

    it('keeps the id of a line that still resolves to the catalog', async () => {
      const shop = await insertShop([line({ itemId: srdItemId, price: gp(1), stock: null })]);
      const character = await insertBuyer();

      const receipt = await purchase.purchase(dmId, shop.id, {
        characterId: character.id,
        itemIndex: 0,
        quantity: 1,
      });

      expect(receipt.item.itemId).toBe(srdItemId);
      const bought = await ctx.prisma.character.findUniqueOrThrow({ where: { id: character.id } });
      const inventory = bought.inventory as unknown as InventoryItem[];
      expect(inventory[0]).toMatchObject({ name: 'Elixir of Health', itemId: srdItemId });
    });

    it('keeps the id when the buyer owns the homebrew item', async () => {
      // The DM buying from their own shop can read their own homebrew, so the
      // link is good on their sheet and dropping it would lose real information.
      const shop = await insertShop([
        line({ itemId: dmHomebrewId, name: "Maelin's Own Brew", price: gp(1), stock: null }),
      ]);
      const character = await insertBuyer();

      const receipt = await purchase.purchase(dmId, shop.id, {
        characterId: character.id,
        itemIndex: 0,
        quantity: 1,
      });

      expect(receipt.item.itemId).toBe(dmHomebrewId);
      const bought = await ctx.prisma.character.findUniqueOrThrow({ where: { id: character.id } });
      const inventory = bought.inventory as unknown as InventoryItem[];
      expect(inventory[0]).toMatchObject({ name: "Maelin's Own Brew", itemId: dmHomebrewId });
    });
  });
});
