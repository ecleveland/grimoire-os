import type { Currency, EquipmentChoiceItem, InventoryItem, StartingEquipment } from '@/lib/types';

/** Zeroed coin purse. */
export function emptyCurrency(): Currency {
  return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
}

/**
 * Average gp for a class starting-gold formula like `"2d4 x 10 gp"`. Returns the
 * deterministic PHB-standard average (avg of NdM is N·(M+1)/2) rather than a live
 * roll so the resolved purse is reproducible and unit-testable. Falls back to a
 * flat `"NN gp"` amount, and returns null when nothing parses — including a
 * dice-shaped term that is present but invalid (so a malformed formula never
 * silently scrapes its multiplier as if it were a flat amount).
 */
export function parseStartingGold(formula: string): number | null {
  const dice = /(\d+)\s*d\s*(\d+)\s*(?:[x×*]\s*(\d+))?/i.exec(formula);
  if (dice) {
    const n = Number(dice[1]);
    const faces = Number(dice[2]);
    const mult = dice[3] ? Number(dice[3]) : 1;
    if (n > 0 && faces > 0) return Math.round(((n * (faces + 1)) / 2) * mult);
    return null; // dice term present but invalid (e.g. "0d4 x 10")
  }
  // A dice-shaped fragment that didn't match above (e.g. "d4 x 10", no count) is
  // a malformed formula, not a flat amount — don't grab a stray number from it.
  if (/d\s*\d/i.test(formula)) return null;
  const flat = /(\d+)\s*gp/i.exec(formula);
  return flat ? Number(flat[1]) : null;
}

/** One side (A or B) of a parsed background-equipment choice. */
export interface ParsedEquipmentOption {
  items: InventoryItem[];
  currency: Currency;
}

/** A background's free-text `equipment` parsed into its A/B alternatives. */
export interface ParsedBackgroundEquipment {
  a: ParsedEquipmentOption;
  b: ParsedEquipmentOption;
}

type CoinKey = keyof Currency;
const COIN_KEYS: readonly CoinKey[] = ['cp', 'sp', 'ep', 'gp', 'pp'];

/** Add every denomination of `src` into `target` in place. */
function addCurrency(target: Currency, src: Currency): void {
  for (const k of COIN_KEYS) target[k] += src[k];
}

/** Classify one comma-separated token as coin (any denomination) or an item. */
function parseEquipmentList(str: string): ParsedEquipmentOption {
  const items: InventoryItem[] = [];
  const currency = emptyCurrency();
  for (const raw of str.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    // "8 gp", "5 sp", "12 cp" — any coin denomination, tolerating trailing
    // punctuation ("8 gp.") so it never falls through to the item branch.
    const coin = /^(\d+)\s*(cp|sp|ep|gp|pp)\b\.?$/i.exec(token);
    if (coin) {
      currency[coin[2].toLowerCase() as CoinKey] += Number(coin[1]);
      continue;
    }
    // A leading integer is a quantity ("2 Daggers", "20 Arrows"); anything else
    // (incl. parenthetical counts like "Parchment (10 sheets)") is a single item.
    const qty = /^(\d+)\s+(.+)$/.exec(token);
    if (qty) {
      items.push({ name: qty[2].trim(), quantity: Number(qty[1]), equipped: false });
    } else {
      items.push({ name: token, quantity: 1, equipped: false });
    }
  }
  return { items, currency };
}

/**
 * Parse a background's `equipment` string of the form
 * `"Choose A or B: (A) <items…>; or (B) <items…>"` into structured options.
 * Returns null when the string doesn't follow that shape (the caller then shows
 * it verbatim rather than guessing).
 */
export function parseBackgroundEquipment(raw: string): ParsedBackgroundEquipment | null {
  const m = /\(A\)\s*(.+?)\s*;\s*or\s*\(B\)\s*(.+?)\s*$/i.exec(raw);
  if (!m) return null;
  return { a: parseEquipmentList(m[1]), b: parseEquipmentList(m[2]) };
}

function toInventoryItem(item: EquipmentChoiceItem): InventoryItem {
  return { name: item.name, quantity: item.quantity, equipped: false };
}

/**
 * Resolve a class's structured starting equipment into inventory lines: the
 * always-granted `guaranteed` items plus, for each choice group, the items in the
 * picked `from` bundles. `selections[i]` holds the chosen bundle indices for
 * choice group `i`; out-of-range indices are ignored, duplicates collapse, and
 * each group is clamped to its `choose` count — so the "pick `choose` bundles"
 * rule holds here, not only in the UI that drives this resolver.
 */
export function resolveClassEquipment(
  equip: StartingEquipment,
  selections: number[][]
): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const g of equip.guaranteed ?? []) items.push(toInventoryItem(g));
  equip.choices.forEach((choice, groupIndex) => {
    const picks = [...new Set(selections[groupIndex] ?? [])].slice(0, choice.choose);
    for (const bundleIndex of picks) {
      const bundle = choice.from[bundleIndex];
      if (!bundle) continue;
      for (const it of bundle.items) items.push(toInventoryItem(it));
    }
  });
  return items;
}

/** Combine same-named lines, summing their quantities (order preserved). */
export function mergeInventory(items: InventoryItem[]): InventoryItem[] {
  const out: InventoryItem[] = [];
  const byName = new Map<string, InventoryItem>();
  for (const item of items) {
    const existing = byName.get(item.name);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      const copy = { ...item };
      byName.set(item.name, copy);
      out.push(copy);
    }
  }
  return out;
}

export interface EquipmentSelections {
  /** Take the listed class equipment, or its starting-gold alternative. */
  classMode: 'equipment' | 'gold';
  /** Per choice-group, the picked `from` bundle indices. */
  choiceSelections: number[][];
  /** Which background-equipment alternative is taken. */
  bgMode: 'a' | 'b';
}

/**
 * Fold the class equipment and the background equipment into a single resolved
 * inventory + currency, honoring the equipment-vs-gold toggles. Coin from both
 * sources accrues into one purse; same-named items are merged.
 */
export function resolveEquipment(input: {
  classEquip: StartingEquipment | null;
  background: ParsedBackgroundEquipment | null;
  selections: EquipmentSelections;
}): { inventory: InventoryItem[]; currency: Currency } {
  const { classEquip, background, selections } = input;
  const items: InventoryItem[] = [];
  const currency = emptyCurrency();

  if (classEquip) {
    if (selections.classMode === 'equipment') {
      items.push(...resolveClassEquipment(classEquip, selections.choiceSelections));
    } else if (classEquip.startingGold) {
      // `!= null` (not truthiness) so a legitimately-parsed 0 isn't conflated
      // with a parse miss.
      const gp = parseStartingGold(classEquip.startingGold);
      if (gp != null) currency.gp += gp;
    }
  }

  if (background) {
    const opt = selections.bgMode === 'a' ? background.a : background.b;
    items.push(...opt.items);
    addCurrency(currency, opt.currency);
  }

  return { inventory: mergeInventory(items), currency };
}
