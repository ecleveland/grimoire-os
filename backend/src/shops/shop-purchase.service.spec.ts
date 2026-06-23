import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { toCopper } from '@grimoire-os/shared';
import { ShopPurchaseService } from './shop-purchase.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from '../test/fixtures';

describe('ShopPurchaseService', () => {
  let service: ShopPurchaseService;
  let prisma: MockPrismaService;
  let campaignAuth: { assertCampaignMember: jest.Mock };

  const SHOP_ID = 'shop-1111-2222-3333-444444444444';
  const CHARACTER_ID = 'char-1111-2222-3333-444444444444';

  const zero = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const gp = (n: number) => ({ ...zero, gp: n });

  const lineItem = (over: Record<string, unknown> = {}) => ({
    itemId: null,
    name: 'Potion of Healing',
    category: 'Potion',
    price: gp(50),
    stock: 5,
    ...over,
  });

  // Owner of the campaign is USER_ID; the buyer (USER_ID_2) is a non-owner member.
  const buildShop = (over: Record<string, unknown> = {}) => ({
    id: SHOP_ID,
    campaignId: CAMPAIGN_ID,
    createdById: USER_ID,
    name: "Maelin's Apothecary",
    theme: 'alchemist',
    description: null,
    icon: null,
    accent: null,
    items: [lineItem()],
    isOpen: true,
    version: 0,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
    ...over,
  });

  const buildCharacter = (over: Record<string, unknown> = {}) => ({
    id: CHARACTER_ID,
    userId: USER_ID_2,
    campaignId: CAMPAIGN_ID,
    currency: gp(100),
    inventory: [],
    version: 0,
    ...over,
  });

  const dto = (over: Record<string, unknown> = {}) => ({
    characterId: CHARACTER_ID,
    itemIndex: 0,
    quantity: 1,
    ...over,
  });

  beforeEach(async () => {
    campaignAuth = { assertCampaignMember: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopPurchaseService,
        prismaMockProvider(),
        { provide: CampaignAuthService, useValue: campaignAuth },
      ],
    }).compile();

    service = module.get<ShopPurchaseService>(ShopPurchaseService);
    prisma = module.get<MockPrismaService>(PrismaService as unknown as new () => MockPrismaService);

    // Default happy-path wiring; individual tests override as needed.
    campaignAuth.assertCampaignMember.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
    prisma.shop.findUnique.mockResolvedValue(buildShop());
    prisma.character.findUnique.mockResolvedValue(buildCharacter());
    prisma.shop.updateMany.mockResolvedValue({ count: 1 });
    prisma.character.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('happy path', () => {
    it('deducts coin, adds the item, decrements stock — all in one transaction', async () => {
      const receipt = await service.purchase(USER_ID_2, SHOP_ID, dto({ quantity: 1 }));

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Shop stock written under an optimistic-lock guard on the read version.
      const shopArgs = prisma.shop.updateMany.mock.calls[0][0];
      expect(shopArgs.where).toEqual({ id: SHOP_ID, version: 0 });
      expect(shopArgs.data.version).toEqual({ increment: 1 });
      expect((shopArgs.data.items as Array<{ stock: number }>)[0].stock).toBe(4);

      // Character currency + inventory written under its own version guard.
      const charArgs = prisma.character.updateMany.mock.calls[0][0];
      expect(charArgs.where).toEqual({ id: CHARACTER_ID, version: 0 });
      expect(charArgs.data.version).toEqual({ increment: 1 });
      expect(toCopper(charArgs.data.currency)).toBe(5_000); // 100gp - 50gp
      expect(charArgs.data.inventory).toEqual([
        { name: 'Potion of Healing', quantity: 1, equipped: false },
      ]);

      // Receipt reflects the post-write state.
      expect(receipt).toMatchObject({
        characterId: CHARACTER_ID,
        item: { name: 'Potion of Healing', itemId: null, quantity: 1 },
        remainingStock: 4,
        shopVersion: 1,
        characterVersion: 1,
      });
      expect(toCopper(receipt.totalPaid)).toBe(5_000);
      expect(toCopper(receipt.newBalance)).toBe(5_000);
    });

    it('scales price and stock by quantity', async () => {
      prisma.character.findUnique.mockResolvedValue(buildCharacter({ currency: gp(200) }));

      const receipt = await service.purchase(USER_ID_2, SHOP_ID, dto({ quantity: 3 }));

      const charArgs = prisma.character.updateMany.mock.calls[0][0];
      expect(toCopper(charArgs.data.currency)).toBe(5_000); // 200gp - 150gp = 50gp
      expect(toCopper(receipt.totalPaid)).toBe(15_000); // 3 × 50gp
      expect(receipt.remainingStock).toBe(2);
    });

    it('merges by itemId into an existing inventory line', async () => {
      prisma.shop.findUnique.mockResolvedValue(
        buildShop({ items: [lineItem({ itemId: 'cat-1' })] })
      );
      prisma.character.findUnique.mockResolvedValue(
        buildCharacter({
          inventory: [{ name: 'Potion of Healing', quantity: 2, equipped: true, itemId: 'cat-1' }],
        })
      );

      await service.purchase(USER_ID_2, SHOP_ID, dto({ quantity: 1 }));

      const charArgs = prisma.character.updateMany.mock.calls[0][0];
      expect(charArgs.data.inventory).toEqual([
        { name: 'Potion of Healing', quantity: 3, equipped: true, itemId: 'cat-1' },
      ]);
    });

    it('skips the shop write entirely for an unlimited-stock line', async () => {
      prisma.shop.findUnique.mockResolvedValue(buildShop({ items: [lineItem({ stock: null })] }));

      const receipt = await service.purchase(USER_ID_2, SHOP_ID, dto());

      expect(prisma.shop.updateMany).not.toHaveBeenCalled();
      expect(prisma.character.updateMany).toHaveBeenCalledTimes(1);
      expect(receipt.remainingStock).toBeNull();
      expect(receipt.shopVersion).toBe(0); // unchanged — shop not written
    });

    it('allows a free (all-zero price) item, leaving the balance unchanged', async () => {
      prisma.shop.findUnique.mockResolvedValue(buildShop({ items: [lineItem({ price: gp(0) })] }));

      const receipt = await service.purchase(USER_ID_2, SHOP_ID, dto());

      expect(toCopper(receipt.newBalance)).toBe(10_000); // 100gp, unchanged
      expect(receipt.remainingStock).toBe(4);
    });

    it('guards on the client-supplied expected versions when provided', async () => {
      await service.purchase(
        USER_ID_2,
        SHOP_ID,
        dto({ expectedShopVersion: 3, expectedCharacterVersion: 7 })
      );

      expect(prisma.shop.updateMany.mock.calls[0][0].where).toEqual({ id: SHOP_ID, version: 3 });
      expect(prisma.character.updateMany.mock.calls[0][0].where).toEqual({
        id: CHARACTER_ID,
        version: 7,
      });
    });
  });

  describe('rejections (no partial writes)', () => {
    const expectNoWrites = () => {
      expect(prisma.shop.updateMany).not.toHaveBeenCalled();
      expect(prisma.character.updateMany).not.toHaveBeenCalled();
    };

    it('rejects insufficient funds with a clear message', async () => {
      prisma.character.findUnique.mockResolvedValue(buildCharacter({ currency: gp(10) }));
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto())).rejects.toThrow(/not enough coin/i);
      expectNoWrites();
    });

    it('rejects buying more than finite stock', async () => {
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto({ quantity: 6 }))).rejects.toThrow(
        BadRequestException
      );
      expectNoWrites();
    });

    it('404s an out-of-range item index', async () => {
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto({ itemIndex: 9 }))).rejects.toThrow(
        NotFoundException
      );
      expectNoWrites();
    });

    it('404s a missing shop', async () => {
      prisma.shop.findUnique.mockResolvedValue(null);
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto())).rejects.toThrow(NotFoundException);
    });

    it('404s a missing character', async () => {
      prisma.character.findUnique.mockResolvedValue(null);
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto())).rejects.toThrow(NotFoundException);
      expectNoWrites();
    });

    it('forbids buying for a character you do not own', async () => {
      prisma.character.findUnique.mockResolvedValue(buildCharacter({ userId: 'someone-else' }));
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto())).rejects.toThrow(ForbiddenException);
      expectNoWrites();
    });

    it("forbids a character not attached to the shop's campaign", async () => {
      prisma.character.findUnique.mockResolvedValue(buildCharacter({ campaignId: 'other-camp' }));
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto())).rejects.toThrow(ForbiddenException);
      expectNoWrites();
    });

    it('forbids a character with no campaign at all', async () => {
      prisma.character.findUnique.mockResolvedValue(buildCharacter({ campaignId: null }));
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto())).rejects.toThrow(ForbiddenException);
    });

    it('propagates the membership check rejection', async () => {
      campaignAuth.assertCampaignMember.mockRejectedValue(
        new ForbiddenException('You are not a member of this campaign')
      );
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto())).rejects.toThrow(ForbiddenException);
      expectNoWrites();
    });

    it('hides a closed shop from a non-owner member as a 404', async () => {
      prisma.shop.findUnique.mockResolvedValue(buildShop({ isOpen: false }));
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto())).rejects.toThrow(NotFoundException);
      expectNoWrites();
    });

    it('lets the owner buy from their own closed shop', async () => {
      prisma.shop.findUnique.mockResolvedValue(buildShop({ isOpen: false }));
      prisma.character.findUnique.mockResolvedValue(buildCharacter({ userId: USER_ID }));

      const receipt = await service.purchase(USER_ID, SHOP_ID, dto());

      expect(receipt.remainingStock).toBe(4);
    });
  });

  describe('optimistic-lock conflicts', () => {
    it('throws ConflictException when the shop version moved', async () => {
      prisma.shop.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto())).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when the character version moved', async () => {
      prisma.character.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.purchase(USER_ID_2, SHOP_ID, dto())).rejects.toThrow(ConflictException);
    });
  });
});
