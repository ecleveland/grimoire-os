import {
  SHOP_THEME_KEYS,
  SHOP_THEME_PRESETS,
  SHOP_SUGGESTION_CAP,
  SHOP_SUGGESTION_PER_CATEGORY,
  getThemePreset,
} from './shop-theme-presets';

// Mirror of the frontend `SHOP_THEMES` list (lib/shop-display.ts). Hardcoded
// here so a divergence between the picker and the suggestion presets fails the
// backend suite rather than silently shipping a theme with no suggestions.
const FRONTEND_SHOP_THEMES = [
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
];

describe('shop-theme-presets', () => {
  it('stays in lock-step with the frontend theme picker', () => {
    expect([...SHOP_THEME_KEYS]).toEqual(FRONTEND_SHOP_THEMES);
  });

  it('defines a preset for every theme key', () => {
    for (const key of SHOP_THEME_KEYS) {
      expect(SHOP_THEME_PRESETS[key]).toBeDefined();
    }
    // No stray presets beyond the declared keys.
    expect(Object.keys(SHOP_THEME_PRESETS).sort()).toEqual([...SHOP_THEME_KEYS].sort());
  });

  it('gives every theme at least one suggestion source', () => {
    for (const key of SHOP_THEME_KEYS) {
      const preset = SHOP_THEME_PRESETS[key];
      expect(preset.categories.length + preset.itemNames.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate categories or item names within a preset', () => {
    for (const key of SHOP_THEME_KEYS) {
      const { categories, itemNames } = SHOP_THEME_PRESETS[key];
      expect(new Set(categories).size).toBe(categories.length);
      expect(new Set(itemNames).size).toBe(itemNames.length);
    }
  });

  it('maps signature themes to their expected categories/pool', () => {
    expect(SHOP_THEME_PRESETS.alchemist.categories).toContain('Potion');
    expect(SHOP_THEME_PRESETS.armorer.categories).toEqual(
      expect.arrayContaining(['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shield'])
    );
    expect(SHOP_THEME_PRESETS.fletcher.categories).toContain('Ammunition');
    expect(SHOP_THEME_PRESETS.tavern.categories).toContain('Food, Drink, or Lodging');
    expect(SHOP_THEME_PRESETS.blacksmith.itemNames).toContain('Smith’s Tools');
  });

  describe('getThemePreset', () => {
    it('resolves a known theme', () => {
      expect(getThemePreset('alchemist')).toBe(SHOP_THEME_PRESETS.alchemist);
    });

    it('is case- and whitespace-insensitive', () => {
      expect(getThemePreset('  Alchemist ')).toBe(SHOP_THEME_PRESETS.alchemist);
    });

    it('returns null for an unknown/custom theme', () => {
      expect(getThemePreset('necromancer')).toBeNull();
      expect(getThemePreset('')).toBeNull();
    });
  });

  it('keeps caps sane (per-category ≤ total)', () => {
    expect(SHOP_SUGGESTION_PER_CATEGORY).toBeGreaterThan(0);
    expect(SHOP_SUGGESTION_PER_CATEGORY).toBeLessThanOrEqual(SHOP_SUGGESTION_CAP);
  });
});
