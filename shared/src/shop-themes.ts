// Canonical catalog of curated shop themes (VEG-443). Single source of truth
// for the DM builder's theme picker (frontend `lib/shop-display.ts`) and the
// theme→stock suggestion presets (backend `shops/data/shop-theme-presets.ts`),
// so the two can't drift. Adding a theme is one edit here: append the key and
// give it a visual; the backend `Record<ShopThemeKey, ShopThemePreset>` then
// fails to compile until a suggestion preset is added too.

/** Fallback visual for a theme. A shop's own icon/accent always override these. */
export interface ShopThemeVisual {
  /** Emoji glyph (no icon library is installed). */
  readonly icon: string;
  /** Accent colour (CSS color). */
  readonly accent: string;
}

/** Curated theme keys offered by the builder picker, in display order. */
export const SHOP_THEME_KEYS = [
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

export type ShopThemeKey = (typeof SHOP_THEME_KEYS)[number];

/**
 * Icon + accent for each curated theme. Typed as `Record<ShopThemeKey, …>` so
 * adding a key to SHOP_THEME_KEYS is a compile error until its visual is filled
 * in. Storefront synonym aliases (innkeeper/priest/general-goods) are display
 * tolerance for stored-but-unlisted themes and stay local to the frontend.
 */
export const SHOP_THEME_CATALOG: Record<ShopThemeKey, ShopThemeVisual> = {
  general: { icon: '📦', accent: '#4f46e5' },
  alchemist: { icon: '🧪', accent: '#16a34a' },
  herbalist: { icon: '🌿', accent: '#15803d' },
  blacksmith: { icon: '⚒️', accent: '#475569' },
  armorer: { icon: '🛡️', accent: '#475569' },
  fletcher: { icon: '🏹', accent: '#0d9488' },
  tavern: { icon: '🍺', accent: '#d97706' },
  baker: { icon: '🥖', accent: '#ca8a04' },
  temple: { icon: '⛪', accent: '#7c3aed' },
  magic: { icon: '✨', accent: '#7c3aed' },
  jeweler: { icon: '💎', accent: '#db2777' },
};
