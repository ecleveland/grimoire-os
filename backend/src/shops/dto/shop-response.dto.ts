import { Expose } from 'class-transformer';
import type { ShopLineItem } from '@grimoire-os/shared';

/** Full shop detail payload (VEG-353), including the stocked line items. */
export class ShopDto {
  @Expose() id!: string;
  @Expose() campaignId!: string;
  @Expose() createdById!: string;
  @Expose() name!: string;
  @Expose() theme!: string;
  @Expose() description!: string | null;
  @Expose() icon!: string | null;
  @Expose() accent!: string | null;
  @Expose() items!: ShopLineItem[];
  @Expose() isOpen!: boolean;
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}

/** Slim shop shape for list views — omits the heavy `items` array. */
export class ShopListItemDto {
  @Expose() id!: string;
  @Expose() campaignId!: string;
  @Expose() createdById!: string;
  @Expose() name!: string;
  @Expose() theme!: string;
  @Expose() description!: string | null;
  @Expose() icon!: string | null;
  @Expose() accent!: string | null;
  @Expose() isOpen!: boolean;
  @Expose() createdAt!: Date;
  @Expose() updatedAt!: Date;
}
