// Catalog name resolution for starting equipment (VEG-462).
//
// The guided builder's equipment lines are hand-authored strings in the seed
// data (`seed/data/classes.ts`), while the catalog rows come from the SRD
// extraction — so the same item is written "Chain mail" in one place and
// "Chain Mail" in the other, and pack names differ only by apostrophe glyph.
// Matching is exact *after* Unicode/case folding: deterministic and total,
// never fuzzy. Relaxing that (plural stripping, parenthetical stripping) is
// what would let a placeholder line like "Any simple weapon" silently resolve
// to a real item, so the folding set below is deliberately closed.

import { Prisma } from '@prisma/client';
import type { GearSourceItem } from '@grimoire-os/shared';

/** The catalog columns name resolution and gear snapshotting need. */
export interface ResolvableItem extends GearSourceItem {
  id: string;
  name: string;
}

/**
 * Prisma projection for `ResolvableItem`. Typed as `Record<keyof
 * ResolvableItem, true>` so the two can't drift: dropping a column here is a
 * compile error rather than a silently-null gear snapshot (every
 * `GearSourceItem` field but `category` is optional, so a missing `damage`
 * would otherwise just quietly stop producing weapon stats).
 */
export const RESOLVABLE_ITEM_SELECT = {
  id: true,
  name: true,
  category: true,
  armorClass: true,
  damage: true,
  damageType: true,
  properties: true,
  stealthDisadvantage: true,
  strengthRequirement: true,
} satisfies Record<keyof ResolvableItem, true> & Prisma.ItemSelect;

/**
 * Seed-name → catalog-name aliases, applied at lookup time. Deliberately
 * minimal: of the seed names that don't fold onto a catalog row, this is the
 * only one `gearMetaFromItem` would have produced stats for. The rest
 * (ammunition bundles, the Arcane/Druidic/Holy focus families, Lute,
 * Spellbook) all snapshot to null anyway, so aliasing them would be upkeep
 * for no derived-stat gain.
 */
// A Map, not an object literal: item names are free user input, and a plain
// object would resolve "constructor"/"__proto__" to inherited members —
// truthy non-strings that then blow up in normalizeItemName, turning a create
// into a 500. (Same hazard `gearMetaFromItem` guards with hasOwnProperty.)
export const ITEM_NAME_ALIASES: ReadonlyMap<string, string> = new Map([
  ['wooden shield', 'Shield'],
]);

/** Apostrophe glyphs the SRD extraction and the seed data disagree about. */
const APOSTROPHES = /[‘’ʼ]/g;

export function normalizeItemName(name: string): string {
  return name.normalize('NFKC').replace(APOSTROPHES, "'").toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Index catalog rows by normalized name. A name claimed by more than one row
 * is dropped rather than resolved to an arbitrary winner — `Item.name` carries
 * no global unique constraint (per-tier partial indexes only), so duplicates
 * are representable even within one tier. Dropping degrades that line to the
 * pre-VEG-462 behavior; guessing would snapshot the wrong stats.
 */
export function buildItemNameIndex(items: readonly ResolvableItem[]): Map<string, ResolvableItem> {
  const index = new Map<string, ResolvableItem>();
  const ambiguous = new Set<string>();
  for (const item of items) {
    const key = normalizeItemName(item.name);
    if (ambiguous.has(key)) continue;
    if (index.has(key)) {
      index.delete(key);
      ambiguous.add(key);
      continue;
    }
    index.set(key, item);
  }
  return index;
}

export function lookupItemByName(
  index: Map<string, ResolvableItem>,
  name: string
): ResolvableItem | undefined {
  const key = normalizeItemName(name);
  const aliased = ITEM_NAME_ALIASES.get(key);
  return index.get(aliased ? normalizeItemName(aliased) : key);
}
