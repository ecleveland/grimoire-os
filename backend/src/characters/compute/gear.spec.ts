// Tests for the shared gear helpers (VEG-410). The mapping + derivation live
// in @grimoire-os/shared so the frontend catalog picker, the backend compute
// layer, and the frontend test fixtures all share one implementation — the
// backend hosts the tests (same pattern as encounter-difficulty.spec.ts).

import {
  gearMetaFromItem,
  deriveArmorClass,
  deriveWeapons,
  inventoryFromJson,
  GearMeta,
  InventoryItem,
} from '@grimoire-os/shared';

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  name: 'Longsword',
  quantity: 1,
  equipped: true,
  ...over,
});

const armorGear = (over: Partial<Extract<GearMeta, { type: 'armor' }>> = {}): GearMeta => ({
  type: 'armor',
  armorType: 'light',
  baseArmorClass: 11,
  ...over,
});

const weaponGear = (over: Partial<Extract<GearMeta, { type: 'weapon' }>> = {}): GearMeta => ({
  type: 'weapon',
  damage: '1d8',
  damageType: 'Slashing',
  properties: [],
  ranged: false,
  ...over,
});

describe('gearMetaFromItem', () => {
  it('maps light armor with an uncapped-Dex AC string', () => {
    expect(
      gearMetaFromItem({
        category: 'Light Armor',
        armorClass: '11 + Dex modifier',
        properties: [],
      })
    ).toEqual({ type: 'armor', armorType: 'light', baseArmorClass: 11 });
  });

  it('maps medium armor, taking the leading integer of the AC string', () => {
    expect(
      gearMetaFromItem({
        category: 'Medium Armor',
        armorClass: '13 + Dex modifier (max 2)',
        properties: [],
      })
    ).toEqual({ type: 'armor', armorType: 'medium', baseArmorClass: 13 });
  });

  it('takes the first tier of a multi-tier medium AC string', () => {
    expect(
      gearMetaFromItem({
        category: 'Medium Armor',
        armorClass: '12/13/14/15 + Dex modifier (max 2)',
        properties: [],
      })
    ).toEqual({ type: 'armor', armorType: 'medium', baseArmorClass: 12 });
  });

  it('maps heavy armor with stealth disadvantage and a strength requirement', () => {
    expect(
      gearMetaFromItem({
        category: 'Heavy Armor',
        armorClass: '16',
        stealthDisadvantage: true,
        strengthRequirement: 13,
        properties: [],
      })
    ).toEqual({
      type: 'armor',
      armorType: 'heavy',
      baseArmorClass: 16,
      stealthDisadvantage: true,
      strengthRequirement: 13,
    });
  });

  it('omits stealthDisadvantage / strengthRequirement when absent or false', () => {
    const meta = gearMetaFromItem({
      category: 'Light Armor',
      armorClass: '12 + Dex modifier',
      stealthDisadvantage: false,
      properties: [],
    });
    expect(meta).toEqual({ type: 'armor', armorType: 'light', baseArmorClass: 12 });
  });

  it('maps a shield "+2" AC string to a flat bonus', () => {
    expect(gearMetaFromItem({ category: 'Shield', armorClass: '+2', properties: [] })).toEqual({
      type: 'armor',
      armorType: 'shield',
      baseArmorClass: 2,
    });
  });

  it('defaults a shield with no AC string to +2', () => {
    expect(gearMetaFromItem({ category: 'Shield', properties: [] })).toEqual({
      type: 'armor',
      armorType: 'shield',
      baseArmorClass: 2,
    });
  });

  it('returns null for armor with a missing or unparseable AC string', () => {
    expect(gearMetaFromItem({ category: 'Heavy Armor', properties: [] })).toBeNull();
    expect(
      gearMetaFromItem({ category: 'Heavy Armor', armorClass: 'special', properties: [] })
    ).toBeNull();
  });

  it('returns null for body armor with a bonus-form AC string (homebrew "+1")', () => {
    // "+1" is a bonus, not a base — snapshotting base 1 would derive AC ~3.
    // Only shields use the bonus form; body armor degrades to no snapshot.
    expect(
      gearMetaFromItem({ category: 'Light Armor', armorClass: '+1', properties: [] })
    ).toBeNull();
    expect(
      gearMetaFromItem({ category: 'Heavy Armor', armorClass: ' +2', properties: [] })
    ).toBeNull();
  });

  it('returns null for a minus-form AC string on body armor and shields (cursed "-1")', () => {
    // leadingInt strips the sign, so "-1" would otherwise snapshot base 1 on
    // body armor (AC ~3) or a +1 bonus on a cursed shield. Penalties aren't
    // representable in the snapshot — degrade to none.
    expect(
      gearMetaFromItem({ category: 'Light Armor', armorClass: '-1', properties: [] })
    ).toBeNull();
    expect(gearMetaFromItem({ category: 'Shield', armorClass: '-1', properties: [] })).toBeNull();
  });

  it('maps a melee weapon (ranged: false) with its properties', () => {
    expect(
      gearMetaFromItem({
        category: 'Martial Melee Weapon',
        damage: '1d8',
        damageType: 'Slashing',
        properties: ['Versatile (1d10)'],
      })
    ).toEqual({
      type: 'weapon',
      damage: '1d8',
      damageType: 'Slashing',
      properties: ['Versatile (1d10)'],
      ranged: false,
    });
  });

  it('maps a ranged weapon (ranged: true)', () => {
    expect(
      gearMetaFromItem({
        category: 'Simple Ranged Weapon',
        damage: '1d8',
        damageType: 'Piercing',
        properties: ['Ammunition (Range 80/320; Bolt)', 'Loading', 'Two-Handed'],
      })
    ).toMatchObject({ type: 'weapon', ranged: true });
  });

  it('defaults missing weapon properties to an empty array', () => {
    expect(
      gearMetaFromItem({
        category: 'Simple Melee Weapon',
        damage: '1d6',
        damageType: 'Bludgeoning',
      })
    ).toEqual({
      type: 'weapon',
      damage: '1d6',
      damageType: 'Bludgeoning',
      properties: [],
      ranged: false,
    });
  });

  it('returns null for a weapon missing damage or damage type', () => {
    expect(
      gearMetaFromItem({
        category: 'Simple Melee Weapon',
        damageType: 'Bludgeoning',
        properties: [],
      })
    ).toBeNull();
    expect(
      gearMetaFromItem({ category: 'Simple Melee Weapon', damage: '1d6', properties: [] })
    ).toBeNull();
  });

  it('returns null for non-gear categories', () => {
    expect(gearMetaFromItem({ category: 'Adventuring Gear', properties: [] })).toBeNull();
    expect(gearMetaFromItem({ category: 'Equipment Pack', properties: [] })).toBeNull();
    expect(gearMetaFromItem({ category: "Artisan's Tools", properties: [] })).toBeNull();
  });
});

describe('inventoryFromJson', () => {
  it('passes an array through and maps any non-array JSON to []', () => {
    const inv = [item()];
    expect(inventoryFromJson(inv)).toEqual(inv);
    expect(inventoryFromJson({})).toEqual([]);
    expect(inventoryFromJson('[]')).toEqual([]);
    expect(inventoryFromJson(null)).toEqual([]);
    expect(inventoryFromJson(undefined)).toEqual([]);
  });

  it('drops null/non-object elements so one bad row cannot crash every read', () => {
    const good = item();
    expect(inventoryFromJson([null, good, 'junk', 7])).toEqual([good]);
  });
});

describe('deriveArmorClass', () => {
  it('derives unarmored AC = 10 + Dex with no equipped armor', () => {
    expect(deriveArmorClass([], 2, null)).toEqual({
      derived: 12,
      override: null,
      effective: 12,
      breakdown: { base: 10, dexApplied: 2, shield: 0, armorType: 'unarmored' },
    });
  });

  it('applies full Dex to light armor', () => {
    const inv = [item({ name: 'Leather Armor', gear: armorGear({ baseArmorClass: 11 }) })];
    expect(deriveArmorClass(inv, 3, null)).toMatchObject({
      derived: 14,
      breakdown: { base: 11, dexApplied: 3, shield: 0, armorType: 'light' },
    });
  });

  it('caps Dex at +2 for medium armor', () => {
    const inv = [
      item({ name: 'Chain Shirt', gear: armorGear({ armorType: 'medium', baseArmorClass: 13 }) }),
    ];
    expect(deriveArmorClass(inv, 3, null)).toMatchObject({
      derived: 15,
      breakdown: { base: 13, dexApplied: 2, shield: 0, armorType: 'medium' },
    });
  });

  it('applies a negative Dex modifier to medium armor (the cap is an upper bound)', () => {
    const inv = [
      item({ name: 'Chain Shirt', gear: armorGear({ armorType: 'medium', baseArmorClass: 13 }) }),
    ];
    expect(deriveArmorClass(inv, -1, null)).toMatchObject({
      derived: 12,
      breakdown: { base: 13, dexApplied: -1, shield: 0, armorType: 'medium' },
    });
  });

  it('ignores Dex entirely for heavy armor', () => {
    const inv = [
      item({ name: 'Plate Armor', gear: armorGear({ armorType: 'heavy', baseArmorClass: 18 }) }),
    ];
    expect(deriveArmorClass(inv, 3, null)).toMatchObject({
      derived: 18,
      breakdown: { base: 18, dexApplied: 0, shield: 0, armorType: 'heavy' },
    });
  });

  it('stacks a shield on top of body armor', () => {
    const inv = [
      item({ name: 'Chain Mail', gear: armorGear({ armorType: 'heavy', baseArmorClass: 16 }) }),
      item({ name: 'Shield', gear: armorGear({ armorType: 'shield', baseArmorClass: 2 }) }),
    ];
    expect(deriveArmorClass(inv, 1, null)).toMatchObject({
      derived: 18,
      breakdown: { base: 16, dexApplied: 0, shield: 2, armorType: 'heavy' },
    });
  });

  it('stacks a shield on unarmored AC', () => {
    const inv = [
      item({ name: 'Shield', gear: armorGear({ armorType: 'shield', baseArmorClass: 2 }) }),
    ];
    expect(deriveArmorClass(inv, 1, null)).toMatchObject({
      derived: 13,
      breakdown: { base: 10, dexApplied: 1, shield: 2, armorType: 'unarmored' },
    });
  });

  it('counts only the best shield when several are equipped', () => {
    const inv = [
      item({ name: 'Shield', gear: armorGear({ armorType: 'shield', baseArmorClass: 2 }) }),
      item({ name: 'Shield +1', gear: armorGear({ armorType: 'shield', baseArmorClass: 3 }) }),
    ];
    expect(deriveArmorClass(inv, 0, null)).toMatchObject({
      derived: 13,
      breakdown: { base: 10, dexApplied: 0, shield: 3, armorType: 'unarmored' },
    });
  });

  it('picks the body armor with the highest resulting AC when several are equipped', () => {
    const inv = [
      // Studded leather with Dex +3 → 15; plate → 18. Plate wins.
      item({ name: 'Studded Leather', gear: armorGear({ baseArmorClass: 12 }) }),
      item({ name: 'Plate Armor', gear: armorGear({ armorType: 'heavy', baseArmorClass: 18 }) }),
    ];
    expect(deriveArmorClass(inv, 3, null)).toMatchObject({
      derived: 18,
      breakdown: { base: 18, dexApplied: 0, armorType: 'heavy' },
    });
  });

  it('ignores unequipped armor and items without gear metadata', () => {
    const inv = [
      item({
        name: 'Plate Armor',
        equipped: false,
        gear: armorGear({ armorType: 'heavy', baseArmorClass: 18 }),
      }),
      item({ name: 'Rope' }),
    ];
    expect(deriveArmorClass(inv, 2, null)).toMatchObject({
      derived: 12,
      breakdown: { armorType: 'unarmored' },
    });
  });

  it('lets a manual override win while still reporting the derived value', () => {
    const inv = [item({ name: 'Leather Armor', gear: armorGear({ baseArmorClass: 11 }) })];
    expect(deriveArmorClass(inv, 3, 17)).toEqual({
      derived: 14,
      override: 17,
      effective: 17,
      breakdown: { base: 11, dexApplied: 3, shield: 0, armorType: 'light' },
    });
  });

  it('uses worn body armor even when unarmored 10 + Dex would score higher (5e RAW)', () => {
    // Dex +5 in Ring Mail (heavy 14): armor wins at 14, never unarmored 15.
    const inv = [
      item({ name: 'Ring Mail', gear: armorGear({ armorType: 'heavy', baseArmorClass: 14 }) }),
    ];
    expect(deriveArmorClass(inv, 5, null)).toMatchObject({
      derived: 14,
      breakdown: { base: 14, dexApplied: 0, shield: 0, armorType: 'heavy' },
    });
    // Same for medium below the unarmored line: Hide 12 + capped 2 = 14, not 15.
    const hide = [
      item({ name: 'Hide Armor', gear: armorGear({ armorType: 'medium', baseArmorClass: 12 }) }),
    ];
    expect(deriveArmorClass(hide, 5, null)).toMatchObject({
      derived: 14,
      breakdown: { base: 12, dexApplied: 2, armorType: 'medium' },
    });
  });

  it('skips gear whose baseArmorClass is not a finite number (corrupt JSON)', () => {
    const inv = [
      item({
        name: 'Bad Import',
        gear: { type: 'armor', armorType: 'heavy', baseArmorClass: '16' } as never,
      }),
      item({
        name: 'Bad Shield',
        gear: { type: 'armor', armorType: 'shield', baseArmorClass: '2' } as never,
      }),
    ];
    // Falls back to unarmored arithmetic instead of string-concatenating "16".
    expect(deriveArmorClass(inv, 1, null)).toMatchObject({
      derived: 11,
      breakdown: { base: 10, dexApplied: 1, shield: 0, armorType: 'unarmored' },
    });
  });
});

describe('deriveWeapons', () => {
  const mods = { strength: 3, dexterity: 1 };

  it('derives a melee weapon from Strength with proficiency assumed', () => {
    const inv = [
      item({ name: 'Longsword', gear: weaponGear({ properties: ['Versatile (1d10)'] }) }),
    ];
    expect(deriveWeapons(inv, mods, 3)).toEqual([
      {
        name: 'Longsword',
        attackBonus: '+6',
        damage: '1d8+3',
        damageType: 'Slashing',
        notes: 'Versatile (1d10)',
      },
    ]);
  });

  it('derives a ranged weapon from Dexterity', () => {
    const inv = [
      item({
        name: 'Longbow',
        gear: weaponGear({ damage: '1d8', damageType: 'Piercing', ranged: true }),
      }),
    ];
    expect(deriveWeapons(inv, mods, 2)).toEqual([
      {
        name: 'Longbow',
        attackBonus: '+3',
        damage: '1d8+1',
        damageType: 'Piercing',
        notes: undefined,
      },
    ]);
  });

  it('uses the higher of Str/Dex for a Finesse weapon', () => {
    const inv = [
      item({
        name: 'Dagger',
        gear: weaponGear({
          damage: '1d4',
          damageType: 'Piercing',
          properties: ['Finesse', 'Light'],
        }),
      }),
    ];
    // Str 3 > Dex 1 → melee finesse still uses Str here.
    expect(deriveWeapons(inv, mods, 2)[0]).toMatchObject({ attackBonus: '+5', damage: '1d4+3' });
    // Dex-favoured character flips it.
    expect(deriveWeapons(inv, { strength: 0, dexterity: 4 }, 2)[0]).toMatchObject({
      attackBonus: '+6',
      damage: '1d4+4',
    });
  });

  it('omits the damage suffix when the ability modifier is 0', () => {
    const inv = [
      item({ name: 'Mace', gear: weaponGear({ damage: '1d6', damageType: 'Bludgeoning' }) }),
    ];
    expect(deriveWeapons(inv, { strength: 0, dexterity: 0 }, 2)[0]).toMatchObject({
      attackBonus: '+2',
      damage: '1d6',
    });
  });

  it('formats a negative modifier into the damage string', () => {
    const inv = [
      item({ name: 'Club', gear: weaponGear({ damage: '1d4', damageType: 'Bludgeoning' }) }),
    ];
    expect(deriveWeapons(inv, { strength: -1, dexterity: 0 }, 2)[0]).toMatchObject({
      attackBonus: '+1',
      damage: '1d4-1',
    });
  });

  it('ignores unequipped weapons, armor, and gearless items', () => {
    const inv = [
      item({ name: 'Longsword', equipped: false, gear: weaponGear() }),
      item({ name: 'Leather Armor', gear: armorGear() }),
      item({ name: 'Rope' }),
    ];
    expect(deriveWeapons(inv, mods, 2)).toEqual([]);
  });

  it('preserves inventory order', () => {
    const inv = [
      item({ name: 'Longsword', gear: weaponGear() }),
      item({ name: 'Dagger', gear: weaponGear({ damage: '1d4', damageType: 'Piercing' }) }),
    ];
    expect(deriveWeapons(inv, mods, 2).map(w => w.name)).toEqual(['Longsword', 'Dagger']);
  });

  it('tolerates weapon gear missing its properties array (hand-edited row)', () => {
    const inv = [
      item({
        name: 'Old Sword',
        gear: { type: 'weapon', damage: '1d8', damageType: 'Slashing', ranged: false } as never,
      }),
    ];
    expect(deriveWeapons(inv, mods, 2)[0]).toMatchObject({
      name: 'Old Sword',
      attackBonus: '+5',
      notes: undefined,
    });
  });

  it('tolerates wrong-typed properties (string / non-string elements) without crashing', () => {
    const stringProps = [
      item({
        name: 'Bad Import',
        gear: {
          type: 'weapon',
          damage: '1d8',
          damageType: 'Slashing',
          ranged: false,
          properties: 'Finesse',
        } as never,
      }),
    ];
    // A string is not a properties array: no crash, no accidental finesse.
    expect(deriveWeapons(stringProps, mods, 2)[0]).toMatchObject({
      attackBonus: '+5',
      notes: undefined,
    });

    const mixedProps = [
      item({
        name: 'Half Bad',
        gear: {
          type: 'weapon',
          damage: '1d4',
          damageType: 'Piercing',
          ranged: false,
          properties: ['Finesse', 42],
        } as never,
      }),
    ];
    // Non-string elements are dropped; the valid Finesse entry still counts.
    expect(deriveWeapons(mixedProps, { strength: 0, dexterity: 4 }, 2)[0]).toMatchObject({
      attackBonus: '+6',
      notes: 'Finesse',
    });
  });

  it('omits a derived row shadowed by a manual weapon of the same name (manual wins)', () => {
    const inv = [
      item({ name: 'Longsword', gear: weaponGear() }),
      item({ name: 'Dagger', gear: weaponGear({ damage: '1d4', damageType: 'Piercing' }) }),
    ];
    const manual = [
      { name: ' longsword ', attackBonus: '+7', damage: '1d8+4', damageType: 'Slashing' },
    ];
    // Case/whitespace-insensitive match: the player's own entry (which may
    // carry magic/fighting-style bonuses) stays authoritative.
    expect(deriveWeapons(inv, mods, 2, manual).map(w => w.name)).toEqual(['Dagger']);
  });
});
