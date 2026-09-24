import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ShopLineItem } from '@grimoire-os/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { ContentAccessService } from '../srd/content-access.service';
import { buildPaginatedResponse } from '../common/helpers/paginate';
import { toDto, toDtoArray } from '../common/serialization/to-dto';
import { CreateShopDto, ShopLineItemDto } from './dto/create-shop.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { ShopFilterDto } from './dto/shop-query.dto';
import { ShopDto, ShopListItemDto } from './dto/shop-response.dto';
import { containsInsensitive } from '../common/helpers/like';

const ZERO_CURRENCY = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } as const;

/**
 * Normalize validated line items into the persisted `ShopLineItem[]` shape so
 * the stored JSON always matches the shared type other M18 tickets read against:
 * `price` is a full `Currency` (missing denominations default to 0), `stock`
 * defaults to `null` (unlimited), and `itemId` to `null` (no catalog link).
 * `undefined`/`null` input yields `[]`, so a shop is never persisted with a
 * null `items` column.
 */
function normalizeLineItems(items: ShopLineItemDto[] | null | undefined): ShopLineItem[] {
  return (items ?? []).map(item => ({
    itemId: item.itemId ?? null,
    name: item.name,
    category: item.category,
    price: { ...ZERO_CURRENCY, ...item.price },
    stock: item.stock ?? null,
    notes: item.notes,
  }));
}

// Slim projection for the shop list view: omits the heavy `items` JSON column
// the list never renders (mirrors the NPC list projection, VEG-125).
const shopListSelect = {
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
} satisfies Prisma.ShopSelect;

@Injectable()
export class ShopsService {
  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService,
    private contentAccess: ContentAccessService
  ) {}

  /**
   * A linked shop line may only name the global catalog: an SRD or shared item.
   * Anything a buyer cannot read is refused here, at the write boundary, because
   * a purchase copies the line's `itemId` into the buyer's inventory and the
   * buyer is not the item's owner. A DM selling something private uses a custom
   * line instead (no `itemId`), which carries its own name and price.
   *
   * Ids in `knownIds` (already stored on the row being patched) are grandfathered.
   * The edit form resends the whole stock on every save, so validating what the
   * row already holds would leave a shop stocked before this rule permanently
   * unsaveable. A DM could not even rename it. Such a line still sells: the
   * purchase path drops the unreadable id at the point of sale.
   *
   * The message names the offending line, because the DM edits stock by name and
   * never sees an item id.
   */
  private async assertLinesReferenceCatalog(
    items: ShopLineItemDto[] | null | undefined,
    knownIds: ReadonlySet<string> = new Set()
  ): Promise<void> {
    const lines = items ?? [];
    const ids = [...new Set(lines.map(i => i.itemId).filter((id): id is string => !!id))].filter(
      id => !knownIds.has(id)
    );
    if (ids.length === 0) return;
    const found = await this.prisma.item.findMany({
      where: { ...this.contentAccess.globalWhere(), id: { in: ids } },
      select: { id: true },
    });
    const resolved = new Set(found.map(i => i.id));
    const unresolved = ids.filter(id => !resolved.has(id));
    if (unresolved.length > 0) {
      const nameOf = (id: string) => lines.find(i => i.itemId === id)?.name ?? id;
      throw new BadRequestException([
        ...unresolved.map(
          id => `Line "${nameOf(id)}" links an item that is not in the SRD or shared catalog`
        ),
        'Shop lines may link SRD or shared catalog items only, and homebrew items are not eligible',
      ]);
    }
  }

  async create(userId: string, dto: CreateShopDto) {
    await this.campaignAuth.assertCampaignOwner(dto.campaignId, userId);
    const { items, ...rest } = dto;
    await this.assertLinesReferenceCatalog(items);
    const shop = await this.prisma.shop.create({
      data: {
        ...rest,
        createdById: userId,
        items: normalizeLineItems(items) as unknown as Prisma.InputJsonValue,
      },
    });
    return toDto(ShopDto, shop);
  }

  async findAllForCampaign(campaignId: string, userId: string, query: ShopFilterDto) {
    const campaign = await this.campaignAuth.assertCampaignMember(campaignId, userId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.ShopWhereInput = { campaignId };
    if (query.theme) where.theme = query.theme;
    if (query.search) where.name = containsInsensitive(query.search);
    // Non-owner members only ever see open shops; a closed shop may hide spoilers
    // or a secret vendor. The owner (DM) sees all. (VEG-442)
    if (campaign.ownerId !== userId) where.isOpen = true;

    const [data, total] = await Promise.all([
      this.prisma.shop.findMany({
        where,
        select: shopListSelect,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.shop.count({ where }),
    ]);
    return buildPaginatedResponse(toDtoArray(ShopListItemDto, data), total, page, limit);
  }

  async findOne(id: string, userId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException(`Shop "${id}" not found`);
    const campaign = await this.campaignAuth.assertCampaignMember(shop.campaignId, userId);
    // A closed shop is invisible to non-owner members — surface it as a 404 (same
    // message as a missing id) rather than a 403, so its existence and name aren't
    // leaked. The owner (DM) still sees closed shops. (VEG-442)
    if (!shop.isOpen && campaign.ownerId !== userId) {
      throw new NotFoundException(`Shop "${id}" not found`);
    }
    // Coalesce a null `items` column (legacy/externally-inserted row) to [] so
    // the response honors the non-optional `Shop.items` contract.
    return toDto(ShopDto, { ...shop, items: shop.items ?? [] });
  }

  async update(id: string, userId: string, dto: UpdateShopDto) {
    const shop = await this.prisma.shop.findUnique({
      where: { id },
      select: { id: true, campaignId: true, items: true },
    });
    if (!shop) throw new NotFoundException(`Shop "${id}" not found`);
    await this.campaignAuth.assertCampaignOwner(shop.campaignId, userId);
    const { items, ...rest } = dto;
    // Bump the optimistic-lock counter on every edit so an in-flight purchase
    // guarding on the version it read detects this change and conflicts rather
    // than blind-overwriting the items JSON from a pre-edit snapshot (VEG-357).
    const data: Prisma.ShopUpdateInput = { ...rest, version: { increment: 1 } };
    // Only touch `items` when the patch includes it; an explicit null clears the
    // stock to [] rather than writing a contract-violating null column.
    if (items !== undefined) {
      const storedLines = (shop.items as unknown as ShopLineItem[] | null) ?? [];
      const knownIds = new Set(
        storedLines.map(l => l.itemId).filter((itemId): itemId is string => !!itemId)
      );
      await this.assertLinesReferenceCatalog(items, knownIds);
      data.items = normalizeLineItems(items) as unknown as Prisma.InputJsonValue;
    }
    const updated = await this.prisma.shop.update({ where: { id }, data });
    return toDto(ShopDto, updated);
  }

  async remove(id: string, userId: string): Promise<void> {
    const shop = await this.prisma.shop.findUnique({
      where: { id },
      select: { id: true, campaignId: true },
    });
    if (!shop) throw new NotFoundException(`Shop "${id}" not found`);
    await this.campaignAuth.assertCampaignOwner(shop.campaignId, userId);
    await this.prisma.shop.delete({ where: { id } });
  }
}
