import { describe, it, expect } from 'vitest';
import { shopVisuals, stockLabel, isInStock, visibleShops } from '@/lib/shop-display';
import type { ShopListItem } from '@/lib/types';

describe('shopVisuals', () => {
  it('prefers the shop’s own icon and accent over the theme preset', () => {
    expect(shopVisuals({ theme: 'alchemist', icon: '🔮', accent: '#ff0000' })).toEqual({
      icon: '🔮',
      accent: '#ff0000',
    });
  });

  it('falls back to the theme preset when icon/accent are unset', () => {
    expect(shopVisuals({ theme: 'alchemist', icon: null, accent: null })).toEqual({
      icon: '🧪',
      accent: '#16a34a',
    });
  });

  it('treats blank/whitespace icon and accent as unset', () => {
    expect(shopVisuals({ theme: 'tavern', icon: '  ', accent: '' })).toEqual({
      icon: '🍺',
      accent: '#d97706',
    });
  });

  it('is case-insensitive on the theme key', () => {
    expect(shopVisuals({ theme: 'Alchemist', icon: null, accent: null }).icon).toBe('🧪');
  });

  it('uses a generic shopfront default for an unknown theme', () => {
    expect(shopVisuals({ theme: 'mysterious-curiosities', icon: null, accent: null })).toEqual({
      icon: '🏪',
      accent: '#4f46e5',
    });
  });
});

describe('stockLabel', () => {
  it('renders unlimited for null stock', () => {
    expect(stockLabel(null)).toBe('Unlimited');
  });

  it('renders the remaining count for a finite positive stock', () => {
    expect(stockLabel(3)).toBe('3 left');
  });

  it('renders out of stock for zero or negative', () => {
    expect(stockLabel(0)).toBe('Out of stock');
    expect(stockLabel(-2)).toBe('Out of stock');
  });
});

describe('isInStock', () => {
  it('is true for unlimited and positive stock, false at zero', () => {
    expect(isInStock(null)).toBe(true);
    expect(isInStock(1)).toBe(true);
    expect(isInStock(0)).toBe(false);
  });
});

describe('visibleShops', () => {
  const open = { isOpen: true } as ShopListItem;
  const closed = { isOpen: false } as ShopListItem;

  it('hides closed shops from non-owners', () => {
    expect(visibleShops([open, closed], false)).toEqual([open]);
  });

  it('shows all shops to the owner', () => {
    expect(visibleShops([open, closed], true)).toEqual([open, closed]);
  });
});
