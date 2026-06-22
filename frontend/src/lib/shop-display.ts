// Presentation helpers for the player storefront (VEG-356). Kept framework-free
// and pure so they're unit-testable and shared between the storefront list,
// the themed detail banner, and their specs.

import { SHOP_THEME_CATALOG, SHOP_THEME_KEYS } from '@grimoire-os/shared';
import type { Shop, ShopListItem } from '@/lib/types';

interface ThemePreset {
  icon: string;
  accent: string;
}

// Fallback icon (emoji glyph — no icon library is installed) + accent colour per
// known theme. A shop's own `icon`/`accent` always win; this only fills the gaps.
// The curated themes come from the shared catalog (VEG-443); the three synonym
// aliases below are display tolerance for stored-but-unlisted themes, wired to
// the shared visuals so they can't drift from their canonical counterparts.
const THEME_PRESETS: Record<string, ThemePreset> = {
  ...SHOP_THEME_CATALOG,
  innkeeper: SHOP_THEME_CATALOG.tavern,
  priest: SHOP_THEME_CATALOG.temple,
  'general-goods': SHOP_THEME_CATALOG.general,
};

const DEFAULT_PRESET: ThemePreset = { icon: '🏪', accent: '#4f46e5' };

// Curated theme options offered by the builder's theme picker (VEG-354), in
// display order — the shared single source of truth (VEG-443), also keyed by
// the backend suggestion presets. The storefront still renders any stored theme
// via shopVisuals (including the synonym aliases above).
export const SHOP_THEMES = SHOP_THEME_KEYS;

/**
 * Resolve the icon glyph + accent colour to render for a shop. The shop's own
 * `icon`/`accent` take precedence; otherwise fall back to the theme preset, then
 * a generic shopfront default. Empty strings are treated as unset.
 */
export function shopVisuals(shop: Pick<Shop, 'theme' | 'icon' | 'accent'>): ThemePreset {
  const preset = THEME_PRESETS[shop.theme?.toLowerCase().trim()] ?? DEFAULT_PRESET;
  return {
    icon: shop.icon?.trim() || preset.icon,
    accent: shop.accent?.trim() || preset.accent,
  };
}

/**
 * Human-readable stock status for a line item. `null` stock is unlimited; a
 * finite count shows the remaining quantity, and zero/negative reads as sold out.
 */
export function stockLabel(stock: number | null): string {
  if (stock === null) return 'Unlimited';
  if (stock <= 0) return 'Out of stock';
  return `${stock} left`;
}

/** Whether a line item is purchasable now (used to style sold-out rows). */
export function isInStock(stock: number | null): boolean {
  return stock === null || stock > 0;
}

/**
 * Shops a given viewer may see in the storefront: players only see open shops;
 * the owner sees everything (closed shops are badged, not hidden, for them).
 */
export function visibleShops<T extends Pick<ShopListItem, 'isOpen'>>(
  shops: T[],
  isOwner: boolean
): T[] {
  return isOwner ? shops : shops.filter(s => s.isOpen);
}
