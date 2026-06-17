import type { Currency, EquipmentChoiceItem, InventoryItem, StartingEquipment } from '@/lib/types';

/** Zeroed coin purse. */
export function emptyCurrency(): Currency {
  return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
}

/**
 * Average gp for a class starting-gold formula like `"2d4 x 10 gp"`. Returns the
 * deterministic PHB-standard average (avg of NdM is N·(M+1)/2) rather than a live
 * roll so the resolved purse is reproducible and unit-testable. Falls back to a
 * flat `"NN gp"` amount, and returns null when nothing parses.
 */
export function parseStartingGold(formula: string): number | null {
  const dice = /(\d+)\s*d\s*(\d+)\s*(?:[x×*]\s*(\d+))?/i.exec(formula);
  if (dice) {
    const n = Number(dice[1]);
    const faces = Number(dice[2]);
    const mult = dice[3] ? Number(dice[3]) : 1;
    if (n > 0 && faces > 0) return Math.round(((n * (faces + 1)) / 2) * mult);
  }
  const flat = /(\d+)\s*gp/i.exec(formula);
  return flat ? Number(flat[1]) : null;
}

/** One side (A or B) of a parsed background-equipment choice. */
export interface ParsedEquipmentOption {
  items: InventoryItem[];
  gp: number;
}

/** A background's free-text `equipment` parsed into its A/B alternatives. */
export interface ParsedBackgroundEquipment {
  a: ParsedEquipmentOption;
  b: ParsedEquipmentOption;
}

/** Classify one comma-separated token as either coin or an inventory item. */
function parseEquipmentList(str: string): ParsedEquipmentOption {
  const items: InventoryItem[] = [];
  let gp = 0;
  for (const raw of str.split(',')) {
    const token = raw.trim();
    if (!token) continue;
    const gold = /^(\d+)\s*gp$/i.exec(token);
    if (gold) {
      gp += Number(gold[1]);
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
  return { items, gp };
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
 * choice group `i`; out-of-range indices are ignored.
 */
export function resolveClassEquipment(
  equip: StartingEquipment,
  selections: number[][]
): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const g of equip.guaranteed ?? []) items.push(toInventoryItem(g));
  equip.choices.forEach((choice, groupIndex) => {
    for (const bundleIndex of selections[groupIndex] ?? []) {
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
  classEquip?: StartingEquipment | null;
  background?: ParsedBackgroundEquipment | null;
  selections: EquipmentSelections;
}): { inventory: InventoryItem[]; currency: Currency } {
  const { classEquip, background, selections } = input;
  const items: InventoryItem[] = [];
  const currency = emptyCurrency();

  if (classEquip) {
    if (selections.classMode === 'equipment') {
      items.push(...resolveClassEquipment(classEquip, selections.choiceSelections));
    } else if (classEquip.startingGold) {
      const gp = parseStartingGold(classEquip.startingGold);
      if (gp) currency.gp += gp;
    }
  }

  if (background) {
    const opt = selections.bgMode === 'a' ? background.a : background.b;
    items.push(...opt.items);
    currency.gp += opt.gp;
  }

  return { inventory: mergeInventory(items), currency };
}
