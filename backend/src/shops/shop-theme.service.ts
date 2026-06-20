import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { priceFromCost } from '@grimoire-os/shared';
import type { ShopLineItem } from '@grimoire-os/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  getThemePreset,
  SHOP_SUGGESTION_CAP,
  SHOP_SUGGESTION_PER_CATEGORY,
  type ShopThemePreset,
} from './data/shop-theme-presets';

/** The catalog projection the resolver needs — kept narrow on purpose. */
export type SuggestionItemRow = {
  id: string;
  name: string;
  category: string;
  cost: string | null;
};

/**
 * Turn resolved catalog rows into suggested shop lines. Curated pool items
 * (those named explicitly in the preset) come first so signature items always
 * survive the total cap; the remaining category-matched items are capped per
 * category to keep one broad category from swamping the list, then the whole
 * list is capped to a manageable, "few clicks to edit" size. Every line gets a
 * default price from its catalog cost and unlimited stock.
 */
export function resolveSuggestions(
  rows: SuggestionItemRow[],
  preset: ShopThemePreset
): ShopLineItem[] {
  const poolNames = new Set(preset.itemNames);
  const toLine = (r: SuggestionItemRow): ShopLineItem => ({
    itemId: r.id,
    name: r.name,
    category: r.category,
    price: priceFromCost(r.cost),
    stock: null,
  });

  const pooled = rows.filter(r => poolNames.has(r.name)).map(toLine);

  const perCategory = new Map<string, number>();
  const categoryLines: ShopLineItem[] = [];
  for (const r of rows) {
    if (poolNames.has(r.name)) continue; // already counted in `pooled`
    const seen = perCategory.get(r.category) ?? 0;
    if (seen >= SHOP_SUGGESTION_PER_CATEGORY) continue;
    perCategory.set(r.category, seen + 1);
    categoryLines.push(toLine(r));
  }

  return [...pooled, ...categoryLines].slice(0, SHOP_SUGGESTION_CAP);
}

/**
 * Resolves a shop theme into a suggested, fully-editable stock list (VEG-355).
 * The theme→source mapping lives in `data/shop-theme-presets.ts`; this service
 * resolves it against the live item catalog so suggestions stay reseed-safe.
 */
@Injectable()
export class ShopThemeService {
  constructor(private prisma: PrismaService) {}

  async suggestStock(theme: string): Promise<ShopLineItem[]> {
    const preset = getThemePreset(theme);
    if (!preset) return [];

    const or: Prisma.ItemWhereInput[] = [];
    if (preset.categories.length > 0) or.push({ category: { in: preset.categories } });
    if (preset.itemNames.length > 0) or.push({ name: { in: preset.itemNames } });
    if (or.length === 0) return [];

    const rows = await this.prisma.item.findMany({
      where: { OR: or },
      select: { id: true, name: true, category: true, cost: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    return resolveSuggestions(rows, preset);
  }
}
