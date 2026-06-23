import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Currency, InventoryItem, ShopLineItem } from '@grimoire-os/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignAuthService } from '../auth/campaign-auth.service';
import { toDto } from '../common/serialization/to-dto';
import { PurchaseDto } from './dto/purchase.dto';
import { PurchaseReceiptDto } from './dto/purchase-receipt.dto';
import {
  applyStockDecrement,
  mergeInventory,
  priceAndSettle,
  resolvePurchasableLine,
} from './purchase.domain';

const asJson = (value: unknown) => value as Prisma.InputJsonValue;

/**
 * Orchestrates a player buying a line item from a shop (VEG-357): authorize the
 * buyer, price the purchase against the character's purse via the shared coin
 * module, then move coin, goods, and stock in one atomic, version-guarded
 * transaction. All money/inventory/stock rules live in `purchase.domain` (pure,
 * unit-tested); this service is the I/O + auth + exception-mapping edge.
 */
@Injectable()
export class ShopPurchaseService {
  constructor(
    private prisma: PrismaService,
    private campaignAuth: CampaignAuthService
  ) {}

  async purchase(userId: string, shopId: string, dto: PurchaseDto): Promise<PurchaseReceiptDto> {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) throw new NotFoundException(`Shop "${shopId}" not found`);

    const campaign = await this.campaignAuth.assertCampaignMember(shop.campaignId, userId);
    // Closed shops are invisible to non-owner members (VEG-442 parity): surface a
    // 404, not a 403, so a secret vendor's existence isn't leaked.
    if (!shop.isOpen && campaign.ownerId !== userId) {
      throw new NotFoundException(`Shop "${shopId}" not found`);
    }

    const character = await this.prisma.character.findUnique({ where: { id: dto.characterId } });
    if (!character) throw new NotFoundException(`Character "${dto.characterId}" not found`);
    if (character.userId !== userId) {
      throw new ForbiddenException('You do not own this character');
    }
    if (character.campaignId !== shop.campaignId) {
      throw new ForbiddenException("Character is not in this shop's campaign");
    }

    const items = (shop.items ?? []) as unknown as ShopLineItem[];
    const resolution = resolvePurchasableLine(items, dto.itemIndex, dto.quantity);
    if (!resolution.ok) {
      if (resolution.reason === 'not-found') {
        throw new NotFoundException(`No shop item at index ${dto.itemIndex}`);
      }
      throw new BadRequestException('Not enough stock for this purchase');
    }
    const { line } = resolution;

    const priced = priceAndSettle(
      character.currency as unknown as Currency | null,
      line.price,
      dto.quantity
    );
    if (!priced) throw new BadRequestException('Not enough coin for this purchase');

    const newInventory = mergeInventory(character.inventory as unknown as InventoryItem[] | null, {
      name: line.name,
      itemId: line.itemId,
      quantity: dto.quantity,
    });
    const newItems = applyStockDecrement(items, dto.itemIndex, dto.quantity);
    const stockIsFinite = line.stock !== null;

    // Guard each write on the version we read (or the client's echo). Always
    // increment so two concurrent buyers can't both settle off the same
    // snapshot — even a client that never opted into explicit locking is safe.
    const shopVersion = dto.expectedShopVersion ?? shop.version;
    const characterVersion = dto.expectedCharacterVersion ?? character.version;

    await this.prisma.$transaction(async tx => {
      // Only finite-stock lines mutate the shop; unlimited lines skip the write
      // so concurrent buys of an unlimited item never contend on the version.
      if (stockIsFinite) {
        const shopWrite = await tx.shop.updateMany({
          where: { id: shopId, version: shopVersion },
          data: { items: asJson(newItems), version: { increment: 1 } },
        });
        if (shopWrite.count === 0) {
          throw new ConflictException('Shop stock changed during purchase; re-fetch and retry.');
        }
      }

      const charWrite = await tx.character.updateMany({
        where: { id: dto.characterId, version: characterVersion },
        data: {
          currency: asJson(priced.newBalance),
          inventory: asJson(newInventory),
          version: { increment: 1 },
        },
      });
      if (charWrite.count === 0) {
        throw new ConflictException('Character changed during purchase; re-fetch and retry.');
      }
    });

    return toDto(PurchaseReceiptDto, {
      characterId: dto.characterId,
      item: { name: line.name, itemId: line.itemId ?? null, quantity: dto.quantity },
      totalPaid: priced.total,
      newBalance: priced.newBalance,
      remainingStock: newItems[dto.itemIndex].stock,
      // Shop only advanced if we actually wrote it (finite stock).
      shopVersion: stockIsFinite ? shopVersion + 1 : shop.version,
      characterVersion: characterVersion + 1,
    });
  }
}
