// Presentation helpers for the player storefront (VEG-356). Kept framework-free
// and pure so they're unit-testable and shared between the storefront list,
// the themed detail banner, and their specs.

import type { Shop, ShopListItem } from '@/lib/types';

interface ThemePreset {
  icon: string;
  accent: string;
}

// Fallback icon (emoji glyph — no icon library is installed) + accent colour per
// known theme. A shop's own `icon`/`accent` always win; this only fills the gaps.
const THEME_PRESETS: Record<string, ThemePreset> = {
  alchemist: { icon: '🧪', accent: '#16a34a' },
  herbalist: { icon: '🌿', accent: '#15803d' },
  blacksmith: { icon: '⚒️', accent: '#475569' },
  armorer: { icon: '🛡️', accent: '#475569' },
  fletcher: { icon: '🏹', accent: '#0d9488' },
  tavern: { icon: '🍺', accent: '#d97706' },
  innkeeper: { icon: '🍺', accent: '#d97706' },
  baker: { icon: '🥖', accent: '#ca8a04' },
  temple: { icon: '⛪', accent: '#7c3aed' },
  priest: { icon: '⛪', accent: '#7c3aed' },
  magic: { icon: '✨', accent: '#7c3aed' },
  jeweler: { icon: '💎', accent: '#db2777' },
  general: { icon: '📦', accent: '#4f46e5' },
  'general-goods': { icon: '📦', accent: '#4f46e5' },
};

const DEFAULT_PRESET: ThemePreset = { icon: '🏪', accent: '#4f46e5' };

// Curated theme options offered by the builder's theme picker (VEG-354), in
// display order. A subset of THEME_PRESETS' keys — `innkeeper`/`priest`/
// `general-goods` are dropped as synonyms of tavern/temple/general to keep the
// list tidy; the storefront still renders any stored theme via shopVisuals.
export const SHOP_THEMES = [
  'general',
  'alchemist',
  'herbalist',
  'blacksmith',
  'armorer',
  'fletcher',
  'tavern',
  'baker',
  'temple',
  'magic',
  'jeweler',
] as const;

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
