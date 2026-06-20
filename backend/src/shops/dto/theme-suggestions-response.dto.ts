import { Expose } from 'class-transformer';
import type { ShopLineItem } from '@grimoire-os/shared';

/**
 * Suggested stock for a theme (VEG-355). `items` is the same `ShopLineItem[]`
 * shape the stock editor and create endpoint use, so the frontend can drop the
 * suggestions straight into the builder with no transform. Wrapped in an
 * envelope (rather than a bare array) for forward-compatibility.
 */
export class ThemeSuggestionsDto {
  @Expose() theme!: string;
  @Expose() items!: ShopLineItem[];
}
