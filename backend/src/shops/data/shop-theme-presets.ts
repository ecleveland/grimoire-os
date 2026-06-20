// Shop theme → stock-suggestion recipe (VEG-355). Each theme maps to a set of
// item-catalog *categories* (the broad, reliable driver) and/or a curated pool
// of exact item *names* (signature flavor items, in the spirit of the NPC
// profession loot pools in `seed/data/npc-loot-templates.ts`). The suggestion
// endpoint resolves these against the live `items` table at request time, so the
// mapping stays reseed-safe (prices/ids are read fresh, never frozen here).
//
// Names reference `Item.name` exactly (including the catalog's typographic
// apostrophe ’ in tool names); a name that doesn't resolve is silently skipped,
// and categories still deliver suggestions — so a drifted name degrades the
// flavor, never breaks the feature.
//
// Adding a theme is data-only: append its key to SHOP_THEME_KEYS (kept in lock-
// step with the frontend picker `SHOP_THEMES` in `lib/shop-display.ts`) and an
// entry to SHOP_THEME_PRESETS. No control flow changes.

/** A theme's stock-suggestion sources: broad categories and/or curated names. */
export interface ShopThemePreset {
  /** Exact `Item.category` values to pull in bulk (e.g. ['Potion']). */
  readonly categories: readonly string[];
  /** Exact `Item.name` values to always try to include (signature items). */
  readonly itemNames: readonly string[];
}

/**
 * The curated theme keys, in display order. Mirrors `SHOP_THEMES` in the
 * frontend `lib/shop-display.ts`; the spec guards the two against drift.
 */
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

// Per-category cap stops one broad category (e.g. 127 Wondrous Items for the
// magic theme) from swamping the editor; the total cap keeps the pre-fill to a
// "few clicks to edit" size. Curated pool items bypass the per-category cap and
// are placed first so signature items always survive the total cap.
export const SHOP_SUGGESTION_PER_CATEGORY = 8;
export const SHOP_SUGGESTION_CAP = 40;

export const SHOP_THEME_PRESETS: Record<ShopThemeKey, ShopThemePreset> = {
  general: {
    categories: ['Adventuring Gear', 'Equipment Pack', 'Tool'],
    itemNames: [],
  },
  alchemist: {
    categories: ['Potion'],
    itemNames: ['Acid', 'Antitoxin', 'Oil', 'Vial', 'Poison, Basic', 'Poisoner’s Kit'],
  },
  herbalist: {
    categories: ['Potion'],
    itemNames: ['Herbalism Kit', 'Healer’s Kit', 'Antitoxin'],
  },
  blacksmith: {
    categories: ['Martial Melee Weapon', 'Simple Melee Weapon'],
    itemNames: ['Smith’s Tools'],
  },
  armorer: {
    categories: ['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shield'],
    itemNames: ['Smith’s Tools'],
  },
  fletcher: {
    categories: ['Martial Ranged Weapon', 'Simple Ranged Weapon', 'Ammunition'],
    itemNames: ['Arrows (20)', 'Bolts (20)'],
  },
  tavern: {
    categories: ['Food, Drink, or Lodging'],
    itemNames: [],
  },
  baker: {
    // The SRD catalog has no baked-goods category, so this theme leans on the
    // curated pool plus the DM's own custom lines.
    categories: [],
    itemNames: ['Bread (loaf)', 'Rations'],
  },
  temple: {
    categories: ['Holy Symbol'],
    itemNames: ['Holy Water', 'Healer’s Kit', 'Mace'],
  },
  magic: {
    categories: ['Potion', 'Scroll', 'Wand', 'Staff', 'Rod', 'Ring', 'Wondrous Item'],
    itemNames: [],
  },
  jeweler: {
    // No mundane gems category in the SRD; magical rings stand in as curiosities.
    categories: ['Ring'],
    itemNames: ['Jeweler’s Tools'],
  },
};

/**
 * Look up the suggestion recipe for a theme, case-insensitively. Returns `null`
 * for an unknown/custom theme so the endpoint can answer with an empty list
 * rather than an error (theme is a free-form string on a shop).
 */
export function getThemePreset(theme: string): ShopThemePreset | null {
  const key = theme.trim().toLowerCase();
  return (SHOP_THEME_PRESETS as Record<string, ShopThemePreset | undefined>)[key] ?? null;
}
