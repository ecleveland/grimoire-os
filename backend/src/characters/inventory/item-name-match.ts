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
 * Prisma projection for `ResolvableItem`.
 *
 * The `satisfies Record<keyof ResolvableItem, true>` is load-bearing: every
 * `GearSourceItem` field but `category` is optional, so dropping `damage: true`
 * here would otherwise compile clean and silently stop producing weapon
 * snapshots. Requiring every key makes that a compile error.
 *
 * The `Prisma.ItemSelect` constraint is an *annotation*, deliberately not part
 * of the `satisfies` — excess-property checking against an intersection admits
 * any key either constituent declares, which would let the select accrete
 * columns `ResolvableItem` knows nothing about.
 */
export const RESOLVABLE_ITEM_SELECT: Prisma.ItemSelect = {
  id: true,
  name: true,
  category: true,
  armorClass: true,
  damage: true,
  damageType: true,
  properties: true,
  stealthDisadvantage: true,
  strengthRequirement: true,
} satisfies Record<keyof ResolvableItem, true>;

/** Apostrophe glyphs the SRD extraction and the seed data disagree about. */
const APOSTROPHES = /[‘’ʼ]/g;

export function normalizeItemName(name: string): string {
  return name.normalize('NFKC').replace(APOSTROPHES, "'").toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Seed-name → catalog-name aliases, applied at lookup time.
 *
 * Deliberately minimal: of the seed names that don't fold onto a catalog row,
 * this is the only one `gearMetaFromItem` produces stats for — the rest
 * (ammunition bundles, the Arcane/Druidic/Holy focus families, Lute,
 * Spellbook) snapshot to null regardless, so aliasing them would be upkeep for
 * no derived-stat gain. What *enforces* that claim is the gear-snapshot
 * assertions in `starting-equipment-reconciliation.spec.ts`, not this comment.
 *
 * A Map, not an object literal: item names are free user input, and a plain
 * object resolves "constructor"/"__proto__" to inherited members — truthy
 * non-strings that then throw inside `normalizeItemName`, turning a create into
 * a 500. (Same hazard `gearMetaFromItem` guards with `hasOwnProperty`.)
 *
 * Keys are normalized at construction because lookup passes an already-folded
 * key; a hand-written `'Wooden Shield'` would read correctly and never match.
 * Declared after `normalizeItemName` for that reason — it runs at module init.
 */
export const ITEM_NAME_ALIASES: ReadonlyMap<string, string> = new Map(
  ([['wooden shield', 'Shield']] as const).map(([seedName, catalogName]) => [
    normalizeItemName(seedName),
    catalogName,
  ])
);

/**
 * Index catalog rows by normalized name. A name claimed by more than one row
 * is dropped rather than resolved to an arbitrary winner.
 *
 * This branch is live even though `items_srd_name_key` (the partial unique
 * index on `name` where `contentSource = 'srd'`) makes *exact* srd names
 * unique — because the key this index is built on is strictly looser than the
 * one Postgres enforces. Normalization folds case, apostrophe glyph and
 * whitespace, so "Chain Mail" and "chain mail" are two perfectly legal srd rows
 * that still collide here. Don't read the unique index as proof this is dead
 * code; the case-variant tests in `item-name-match.spec.ts` are what pin it.
 *
 * Dropping degrades that line to the pre-VEG-462 behavior; guessing would
 * snapshot the wrong stats.
 */
export function buildItemNameIndex(
  items: readonly ResolvableItem[],
  onAmbiguous?: (normalizedName: string) => void
): Map<string, ResolvableItem> {
  const index = new Map<string, ResolvableItem>();
  const ambiguous = new Set<string>();
  for (const item of items) {
    const key = normalizeItemName(item.name);
    if (ambiguous.has(key)) continue;
    if (index.has(key)) {
      index.delete(key);
      ambiguous.add(key);
      // Reported, not swallowed: every character built while a name is
      // ambiguous loses that line's gear permanently, since resolution runs
      // only on create.
      onAmbiguous?.(key);
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
