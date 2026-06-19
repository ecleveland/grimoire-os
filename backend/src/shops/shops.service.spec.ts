import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ShopsService } from './shops.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { MockPrismaService, prismaMockProvider } from '../test/prisma-mock.factory';
import { USER_ID, USER_ID_2, CAMPAIGN_ID } from '../test/fixtures';
import { ShopDto, ShopListItemDto } from './dto/shop-response.dto';

describe('ShopsService', () => {
  let service: ShopsService;
  let prisma: MockPrismaService;
  let campaignAuth: {
    assertCampaignOwner: jest.Mock;
    assertCampaignMember: jest.Mock;
  };

  const SHOP_ID = 'shop-1111-2222-3333-444444444444';

  const lineItem = {
    itemId: null,
    name: 'Potion of Healing',
    category: 'Potion',
    price: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 },
    stock: 5,
  };

  const mockShop = {
    id: SHOP_ID,
    campaignId: CAMPAIGN_ID,
    createdById: USER_ID,
    name: "Maelin's Apothecary",
    theme: 'alchemist',
    description: 'A cramped shop reeking of sulfur.',
    icon: 'flask',
    accent: 'green',
    items: [lineItem],
    isOpen: true,
    createdAt: new Date('2026-06-01T00:00:00Z'),
    updatedAt: new Date('2026-06-01T00:00:00Z'),
  };

  const slimShop = {
    id: SHOP_ID,
    campaignId: CAMPAIGN_ID,
    createdById: USER_ID,
    name: "Maelin's Apothecary",
    theme: 'alchemist',
    description: 'A cramped shop reeking of sulfur.',
    icon: 'flask',
    accent: 'green',
    isOpen: true,
    createdAt: mockShop.createdAt,
    updatedAt: mockShop.updatedAt,
  };

  beforeEach(async () => {
    campaignAuth = {
      assertCampaignOwner: jest.fn(),
      assertCampaignMember: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopsService,
        prismaMockProvider(),
        { provide: CampaignAuthService, useValue: campaignAuth },
      ],
    }).compile();

    service = module.get<ShopsService>(ShopsService);
    prisma = module.get<MockPrismaService>(PrismaService as unknown as new () => MockPrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      campaignId: CAMPAIGN_ID,
      name: "Maelin's Apothecary",
      theme: 'alchemist',
      items: [lineItem],
    };

    it('throws ForbiddenException when a non-DM tries to create', async () => {
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );

      await expect(service.create(USER_ID_2, createDto)).rejects.toThrow(ForbiddenException);
      expect(prisma.shop.create).not.toHaveBeenCalled();
    });

    it('DM creates a shop with createdById set and items persisted', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.shop.create.mockResolvedValue(mockShop);

      const result = await service.create(USER_ID, createDto);

      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.shop.create).toHaveBeenCalledWith({
        data: {
          campaignId: CAMPAIGN_ID,
          name: "Maelin's Apothecary",
          theme: 'alchemist',
          createdById: USER_ID,
          items: [lineItem],
        },
      });
      expect(result).toEqual(mockShop);
      expect(result).toBeInstanceOf(ShopDto);
    });

    it('defaults items to an empty array when none are supplied', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.shop.create.mockResolvedValue({ ...mockShop, items: [] });

      await service.create(USER_ID, {
        campaignId: CAMPAIGN_ID,
        name: 'Empty Stall',
        theme: 'general-goods',
      });

      expect(prisma.shop.create.mock.calls[0][0].data.items).toEqual([]);
    });

    it('normalizes line items to the full shared shape on write', async () => {
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.shop.create.mockResolvedValue(mockShop);

      // Partial price, omitted stock and itemId — the persisted shape must be
      // a full Currency, stock null (unlimited), itemId null (no catalog link).
      await service.create(USER_ID, {
        campaignId: CAMPAIGN_ID,
        name: 'Smithy',
        theme: 'armorer',
        items: [{ name: 'Longsword', price: { gp: 15 } }],
      } as never);

      expect(prisma.shop.create.mock.calls[0][0].data.items).toEqual([
        {
          itemId: null,
          name: 'Longsword',
          category: undefined,
          price: { cp: 0, sp: 0, ep: 0, gp: 15, pp: 0 },
          stock: null,
          notes: undefined,
        },
      ]);
    });
  });

  describe('findAllForCampaign', () => {
    it('paginates for a member and projects the slim list shape', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.shop.findMany.mockResolvedValue([slimShop]);
      prisma.shop.count.mockResolvedValue(1);

      const result = await service.findAllForCampaign(CAMPAIGN_ID, USER_ID, { page: 1, limit: 20 });

      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.shop.findMany).toHaveBeenCalledWith({
        where: { campaignId: CAMPAIGN_ID },
        select: {
          id: true,
          campaignId: true,
          createdById: true,
          name: true,
          theme: true,
          description: true,
          icon: true,
          accent: true,
          isOpen: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.lastPage).toBe(1);
      expect(result.data[0]).toBeInstanceOf(ShopListItemDto);
      // The heavy items array never reaches the list payload.
      expect((result.data[0] as unknown as Record<string, unknown>).items).toBeUndefined();
    });

    it('applies theme + case-insensitive name filters', async () => {
      campaignAuth.assertCampaignMember.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.shop.findMany.mockResolvedValue([]);
      prisma.shop.count.mockResolvedValue(0);

      await service.findAllForCampaign(CAMPAIGN_ID, USER_ID, {
        page: 2,
        limit: 5,
        theme: 'alchemist',
        search: 'apoth',
      });

      expect(prisma.shop.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            campaignId: CAMPAIGN_ID,
            theme: 'alchemist',
            name: { contains: 'apoth', mode: 'insensitive' },
          },
          skip: 5,
          take: 5,
        })
      );
    });

    it('throws ForbiddenException when a non-member lists', async () => {
      campaignAuth.assertCampaignMember.mockRejectedValue(
        new ForbiddenException('You are not a member of this campaign')
      );

      await expect(
        service.findAllForCampaign(CAMPAIGN_ID, USER_ID_2, { page: 1, limit: 20 })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('returns the shop for a member', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      campaignAuth.assertCampaignMember.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });

      const result = await service.findOne(SHOP_ID, USER_ID);

      expect(prisma.shop.findUnique).toHaveBeenCalledWith({ where: { id: SHOP_ID } });
      expect(campaignAuth.assertCampaignMember).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(result).toEqual(mockShop);
      expect(result).toBeInstanceOf(ShopDto);
    });

    it('throws NotFoundException before consulting auth when the shop does not exist', async () => {
      prisma.shop.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing', USER_ID)).rejects.toThrow(NotFoundException);
      // NotFound must short-circuit before the member check, so a non-member
      // probing a missing id gets 404, not a 403 that would leak existence.
      expect(campaignAuth.assertCampaignMember).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException for a non-member viewer', async () => {
      prisma.shop.findUnique.mockResolvedValue(mockShop);
      campaignAuth.assertCampaignMember.mockRejectedValue(
        new ForbiddenException('You are not a member of this campaign')
      );

      await expect(service.findOne(SHOP_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
    });

    it('coalesces a null items column to an empty array', async () => {
      prisma.shop.findUnique.mockResolvedValue({ ...mockShop, items: null });
      campaignAuth.assertCampaignMember.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });

      const result = await service.findOne(SHOP_ID, USER_ID);

      expect(result.items).toEqual([]);
    });
  });

  describe('update', () => {
    it('updates scalar fields and items for the DM', async () => {
      prisma.shop.findUnique.mockResolvedValue({ id: SHOP_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      const items = [{ ...lineItem, stock: null }];
      const updated = { ...mockShop, name: 'Renamed', items };
      prisma.shop.update.mockResolvedValue(updated);

      const result = await service.update(SHOP_ID, USER_ID, { name: 'Renamed', items } as never);

      expect(prisma.shop.findUnique).toHaveBeenCalledWith({
        where: { id: SHOP_ID },
        select: { id: true, campaignId: true },
      });
      expect(campaignAuth.assertCampaignOwner).toHaveBeenCalledWith(CAMPAIGN_ID, USER_ID);
      expect(prisma.shop.update).toHaveBeenCalledWith({
        where: { id: SHOP_ID },
        data: { name: 'Renamed', items },
      });
      expect(result).toEqual(updated);
    });

    it('does not touch items when they are omitted from the patch', async () => {
      prisma.shop.findUnique.mockResolvedValue({ id: SHOP_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.shop.update.mockResolvedValue({ ...mockShop, isOpen: false });

      await service.update(SHOP_ID, USER_ID, { isOpen: false } as never);

      expect(prisma.shop.update).toHaveBeenCalledWith({
        where: { id: SHOP_ID },
        data: { isOpen: false },
      });
      expect(prisma.shop.update.mock.calls[0][0].data).not.toHaveProperty('items');
    });

    it('clears items to [] (never null) when an explicit null is patched', async () => {
      prisma.shop.findUnique.mockResolvedValue({ id: SHOP_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.shop.update.mockResolvedValue({ ...mockShop, items: [] });

      await service.update(SHOP_ID, USER_ID, { items: null } as never);

      expect(prisma.shop.update.mock.calls[0][0].data.items).toEqual([]);
    });

    it('throws NotFoundException when the shop is missing', async () => {
      prisma.shop.findUnique.mockResolvedValue(null);
      await expect(service.update(SHOP_ID, USER_ID, { name: 'x' } as never)).rejects.toThrow(
        NotFoundException
      );
    });

    it('throws ForbiddenException when a non-DM updates', async () => {
      prisma.shop.findUnique.mockResolvedValue({ id: SHOP_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );
      await expect(service.update(SHOP_ID, USER_ID_2, { name: 'x' } as never)).rejects.toThrow(
        ForbiddenException
      );
      expect(prisma.shop.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes for the DM', async () => {
      prisma.shop.findUnique.mockResolvedValue({ id: SHOP_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockResolvedValue({ id: CAMPAIGN_ID, ownerId: USER_ID });
      prisma.shop.delete.mockResolvedValue(mockShop);

      await service.remove(SHOP_ID, USER_ID);

      expect(prisma.shop.delete).toHaveBeenCalledWith({ where: { id: SHOP_ID } });
    });

    it('throws NotFoundException when the shop is missing', async () => {
      prisma.shop.findUnique.mockResolvedValue(null);
      await expect(service.remove(SHOP_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when a non-DM deletes', async () => {
      prisma.shop.findUnique.mockResolvedValue({ id: SHOP_ID, campaignId: CAMPAIGN_ID });
      campaignAuth.assertCampaignOwner.mockRejectedValue(
        new ForbiddenException('Only the campaign owner can perform this action')
      );
      await expect(service.remove(SHOP_ID, USER_ID_2)).rejects.toThrow(ForbiddenException);
      expect(prisma.shop.delete).not.toHaveBeenCalled();
    });
  });
});
