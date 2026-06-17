import { describe, it, expect } from 'vitest';
import type { StartingEquipment } from '@/lib/types';
import {
  emptyCurrency,
  mergeInventory,
  parseBackgroundEquipment,
  parseStartingGold,
  resolveClassEquipment,
  resolveEquipment,
} from '../equipment-resolve';

const FIGHTER_EQUIP: StartingEquipment = {
  choices: [
    {
      choose: 1,
      from: [
        { items: [{ name: 'Chain mail', quantity: 1 }] },
        {
          items: [
            { name: 'Leather armor', quantity: 1 },
            { name: 'Longbow', quantity: 1 },
            { name: 'Arrow', quantity: 20 },
          ],
        },
      ],
    },
    {
      choose: 1,
      from: [
        { items: [{ name: 'Handaxe', quantity: 2 }] },
        { items: [{ name: 'Any simple weapon', quantity: 1 }] },
      ],
    },
  ],
  guaranteed: [{ name: "Explorer's pack", quantity: 1 }],
  startingGold: '5d4 x 10 gp',
};

describe('parseStartingGold', () => {
  it('returns the PHB-average gp for an "NdM x K gp" formula', () => {
    // 2d4 averages 5; ×10 = 50.
    expect(parseStartingGold('2d4 x 10 gp')).toBe(50);
    // 5d4 averages 12.5; ×10 = 125.
    expect(parseStartingGold('5d4 x 10 gp')).toBe(125);
  });

  it('accepts the × multiply sign and is whitespace/case tolerant', () => {
    expect(parseStartingGold('2D4×10 GP')).toBe(50);
  });

  it('handles a formula with no multiplier (×1)', () => {
    // 3d6 averages 10.5 → rounded 11.
    expect(parseStartingGold('3d6 gp')).toBe(11);
  });

  it('falls back to a flat "NN gp" amount when there is no dice term', () => {
    expect(parseStartingGold('50 gp')).toBe(50);
  });

  it('returns null when the formula is unparseable', () => {
    expect(parseStartingGold('a fistful of nothing')).toBeNull();
  });

  it('returns null for a malformed dice term instead of scraping the multiplier', () => {
    // A dice term that is present but invalid must not fall through and grab the
    // "x 10" multiplier as if it were a flat amount.
    expect(parseStartingGold('0d4 x 10 gp')).toBeNull();
    expect(parseStartingGold('d4 x 10 gp')).toBeNull();
  });

  it('parses a flat "0 gp" as 0 (not null)', () => {
    expect(parseStartingGold('0 gp')).toBe(0);
  });
});

describe('parseBackgroundEquipment', () => {
  const raw =
    "Choose A or B: (A) Calligrapher's Supplies, Book (prayers), Holy Symbol, Parchment (10 sheets), Robe, 8 GP; or (B) 50 GP";

  it('splits the A/B options into items and gold', () => {
    const parsed = parseBackgroundEquipment(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.a.currency.gp).toBe(8);
    expect(parsed!.a.items.map(i => i.name)).toEqual([
      "Calligrapher's Supplies",
      'Book (prayers)',
      'Holy Symbol',
      'Parchment (10 sheets)',
      'Robe',
    ]);
    expect(parsed!.a.items.every(i => i.quantity === 1 && i.equipped === false)).toBe(true);
    // Option B is the pure-gold alternative.
    expect(parsed!.b.items).toEqual([]);
    expect(parsed!.b.currency.gp).toBe(50);
  });

  it('extracts a leading quantity from an item token', () => {
    const parsed = parseBackgroundEquipment(
      "Choose A or B: (A) 2 Daggers, 20 Arrows, Thieves' Tools, 16 GP; or (B) 50 GP"
    );
    expect(parsed!.a.items).toEqual([
      { name: 'Daggers', quantity: 2, equipped: false },
      { name: 'Arrows', quantity: 20, equipped: false },
      { name: "Thieves' Tools", quantity: 1, equipped: false },
    ]);
    expect(parsed!.a.currency.gp).toBe(16);
  });

  it('routes every coin denomination (with trailing punctuation) into currency', () => {
    const parsed = parseBackgroundEquipment(
      'Choose A or B: (A) Lamp, 5 sp, 12 cp, 8 gp.; or (B) 2 pp, 50 GP'
    );
    // Sub-gold coin and a trailing period must not become junk "sp"/"gp." items.
    expect(parsed!.a.items.map(i => i.name)).toEqual(['Lamp']);
    expect(parsed!.a.currency).toEqual({ cp: 12, sp: 5, ep: 0, gp: 8, pp: 0 });
    expect(parsed!.b.items).toEqual([]);
    expect(parsed!.b.currency).toEqual({ cp: 0, sp: 0, ep: 0, gp: 50, pp: 2 });
  });

  it('returns null for a string that is not in the "Choose A or B" shape', () => {
    expect(parseBackgroundEquipment('A holy symbol and a prayer book')).toBeNull();
  });
});

describe('resolveClassEquipment', () => {
  it('always includes guaranteed items plus the picked bundles', () => {
    const items = resolveClassEquipment(FIGHTER_EQUIP, [[1], [0]]);
    expect(items).toEqual([
      { name: "Explorer's pack", quantity: 1, equipped: false },
      { name: 'Leather armor', quantity: 1, equipped: false },
      { name: 'Longbow', quantity: 1, equipped: false },
      { name: 'Arrow', quantity: 20, equipped: false },
      { name: 'Handaxe', quantity: 2, equipped: false },
    ]);
  });

  it('includes guaranteed items even when no choices are picked yet', () => {
    expect(resolveClassEquipment(FIGHTER_EQUIP, [])).toEqual([
      { name: "Explorer's pack", quantity: 1, equipped: false },
    ]);
  });

  it('ignores out-of-range bundle indices', () => {
    expect(resolveClassEquipment({ choices: FIGHTER_EQUIP.choices }, [[9], []])).toEqual([]);
  });

  it('clamps a group to its choose count and dedups repeated picks', () => {
    // First group is choose:1 — even if three indices arrive, only the first is
    // honored; duplicates collapse. Enforces the invariant in the resolver, not
    // just the UI.
    expect(resolveClassEquipment(FIGHTER_EQUIP, [[0, 0, 1], []])).toEqual([
      { name: "Explorer's pack", quantity: 1, equipped: false },
      { name: 'Chain mail', quantity: 1, equipped: false },
    ]);
  });
});

describe('mergeInventory', () => {
  it('sums quantities of same-named items', () => {
    expect(
      mergeInventory([
        { name: 'Dagger', quantity: 1, equipped: false },
        { name: 'Dagger', quantity: 2, equipped: false },
        { name: 'Rope', quantity: 1, equipped: false },
      ])
    ).toEqual([
      { name: 'Dagger', quantity: 3, equipped: false },
      { name: 'Rope', quantity: 1, equipped: false },
    ]);
  });
});

describe('resolveEquipment — top-level equipment-vs-gold', () => {
  const background = parseBackgroundEquipment('Choose A or B: (A) Holy Symbol, 8 GP; or (B) 50 GP');

  it('equipment mode: resolved class items land in inventory, no class gold', () => {
    const { inventory, currency } = resolveEquipment({
      classEquip: FIGHTER_EQUIP,
      background: null,
      selections: { classMode: 'equipment', choiceSelections: [[0], [0]], bgMode: 'a' },
    });
    expect(inventory.map(i => i.name)).toEqual(["Explorer's pack", 'Chain mail', 'Handaxe']);
    expect(currency).toEqual(emptyCurrency());
  });

  it('gold mode: class gold populates currency, no class items', () => {
    const { inventory, currency } = resolveEquipment({
      classEquip: FIGHTER_EQUIP,
      background: null,
      selections: { classMode: 'gold', choiceSelections: [[0], [0]], bgMode: 'a' },
    });
    expect(inventory).toEqual([]);
    expect(currency.gp).toBe(125); // 5d4 x 10 average
  });

  it('background option A adds items + its gold; B adds only gold', () => {
    const a = resolveEquipment({
      classEquip: null,
      background,
      selections: { classMode: 'equipment', choiceSelections: [], bgMode: 'a' },
    });
    expect(a.inventory.map(i => i.name)).toEqual(['Holy Symbol']);
    expect(a.currency.gp).toBe(8);

    const b = resolveEquipment({
      classEquip: null,
      background,
      selections: { classMode: 'equipment', choiceSelections: [], bgMode: 'b' },
    });
    expect(b.inventory).toEqual([]);
    expect(b.currency.gp).toBe(50);
  });

  it('combines class gold and background gold into one purse', () => {
    const { currency } = resolveEquipment({
      classEquip: FIGHTER_EQUIP,
      background,
      selections: { classMode: 'gold', choiceSelections: [], bgMode: 'b' },
    });
    expect(currency.gp).toBe(175); // 125 class + 50 background
  });

  it('merges a duplicate item granted by both class and background into one line', () => {
    // Class group 2 bundle 0 grants Handaxe ×2; background option A also grants a
    // Handaxe — they must collapse into a single summed line.
    const bgHandaxe = parseBackgroundEquipment('Choose A or B: (A) Handaxe; or (B) 50 GP');
    const { inventory } = resolveEquipment({
      classEquip: FIGHTER_EQUIP,
      background: bgHandaxe,
      selections: { classMode: 'equipment', choiceSelections: [[0], [0]], bgMode: 'a' },
    });
    expect(inventory).toEqual([
      { name: "Explorer's pack", quantity: 1, equipped: false },
      { name: 'Chain mail', quantity: 1, equipped: false },
      { name: 'Handaxe', quantity: 3, equipped: false },
    ]);
  });
});
