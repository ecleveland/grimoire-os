import { Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import type { Currency } from '@grimoire-os/shared';

/** A single bought line on the receipt. */
export class PurchaseReceiptItemDto {
  @ApiProperty() @Expose() name!: string;
  @ApiProperty({ nullable: true }) @Expose() itemId!: string | null;
  @ApiProperty() @Expose() quantity!: number;
}

/**
 * Result of a successful purchase (VEG-357). Carries everything a Buy UI needs
 * to re-render both the purse and the storefront without a re-fetch, plus the
 * post-write versions so a follow-up purchase can chain the optimistic lock.
 */
export class PurchaseReceiptDto {
  @ApiProperty() @Expose() characterId!: string;
  @ApiProperty({ type: PurchaseReceiptItemDto })
  @Expose()
  @Type(() => PurchaseReceiptItemDto)
  item!: PurchaseReceiptItemDto;
  @ApiProperty() @Expose() totalPaid!: Currency;
  @ApiProperty() @Expose() newBalance!: Currency;
  @ApiProperty({ nullable: true, description: 'null = unlimited' })
  @Expose()
  remainingStock!: number | null;
  @ApiProperty() @Expose() shopVersion!: number;
  @ApiProperty() @Expose() characterVersion!: number;
}
