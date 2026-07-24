// Tests for the shared gear helpers (VEG-410). The mapping + derivation live
// in @grimoire-os/shared so the frontend catalog picker, the backend compute
// layer, and the frontend test fixtures all share one implementation — the
// backend hosts the tests (same pattern as encounter-difficulty.spec.ts).

import {
  gearMetaFromItem,
  isGearCategory,
  deriveArmorClass,
  deriveWeapons,
  inventoryFromJson,
  BodyArmorGear,
  GearMeta,
  InventoryItem,
  ShieldGear,
} from '@grimoire-os/shared';

const item = (over: Partial<InventoryItem> = {}): InventoryItem => ({
  name: 'Longsword',
  quantity: 1,
  equipped: true,
  ...over,
});

const bodyArmorGear = (over: Partial<BodyArmorGear> = {}): BodyArmorGear => ({
  type: 'armor',
  armorType: 'light',
  baseArmorClass: 11,
  ...over,
});

// A shield carries an additive armorClassBonus, never a baseArmorClass (VEG-461).
const shieldGear = (over: Partial<ShieldGear> = {}): ShieldGear => ({
  type: 'armor',
  armorType: 'shield',
  armorClassBonus: 2,
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
      armorClassBonus: 2,
    });
  });

  it('defaults a shield with no AC string to +2', () => {
    expect(gearMetaFromItem({ category: 'Shield', properties: [] })).toEqual({
      type: 'armor',
      armorType: 'shield',
      armorClassBonus: 2,
    });
  });

  it('recognizes a magic shield (category "Armor", subcategory "Shield", overlaid "+2") as a shield', () => {
    // VEG-460: the SRD files magic shields under category "Armor" with
    // subcategory "Shield" (→ properties ["Shield"]); the seed overlay stamps a
    // "+2". Derive the flat shield bonus without reclassifying the category.
    expect(
      gearMetaFromItem({ category: 'Armor', armorClass: '+2', properties: ['Shield'] })
    ).toEqual({ type: 'armor', armorType: 'shield', armorClassBonus: 2 });
  });

  it('does not treat an unstamped "Armor"/"Shield" row as derivable', () => {
    // No overlaid "+N" (e.g. the generic "Shield, +1, +2, or +3" template or a
    // homebrew "Armor" row) → underivable, covered by the picker hint.
    expect(gearMetaFromItem({ category: 'Armor', properties: ['Shield'] })).toBeNull();
  });

  it('does not treat magic body armor (category "Armor", non-shield subcategory) as a shield', () => {
    // "Adamantine Armor" etc. carry a non-"Shield" subcategory and no base AC —
    // an overlaid "+N" must not turn body armor into a shield.
    expect(
      gearMetaFromItem({
        category: 'Armor',
        armorClass: '+2',
        properties: ['Any Medium or Heavy, Except Hide Armor'],
      })
    ).toBeNull();
  });

  it('returns null for a cursed minus-form magic shield', () => {
    expect(
      gearMetaFromItem({ category: 'Armor', armorClass: '-1', properties: ['Shield'] })
    ).toBeNull();
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
      weaponCategory: 'martial',
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
    ).toMatchObject({ type: 'weapon', ranged: true, weaponCategory: 'simple' });
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
      weaponCategory: 'simple',
    });
  });

  it('snapshots the proficiency tier from each catalog weapon category (VEG-463)', () => {
    expect(
      gearMetaFromItem({ category: 'Martial Ranged Weapon', damage: '1d8', damageType: 'Piercing' })
    ).toMatchObject({ weaponCategory: 'martial', ranged: true });
    expect(
      gearMetaFromItem({ category: 'Martial Melee Weapon', damage: '1d8', damageType: 'Slashing' })
    ).toMatchObject({ weaponCategory: 'martial', ranged: false });
    expect(
      gearMetaFromItem({ category: 'Simple Ranged Weapon', damage: '1d6', damageType: 'Piercing' })
    ).toMatchObject({ weaponCategory: 'simple', ranged: true });
  });

  it('omits weaponCategory for a homebrew category that is neither simple nor martial', () => {
    const meta = gearMetaFromItem({
      category: 'Exotic Weapon',
      damage: '2d6',
      damageType: 'Psychic',
    });
    expect(meta).toMatchObject({ type: 'weapon' });
    expect(meta).not.toHaveProperty('weaponCategory');
  });

  it('requires a whole-word tier prefix — "Simpler Weapon" snapshots no tier', () => {
    // A prefix-only match would wrongly stamp homebrew "Simpler Weapon" as
    // simple-tier and derive "Not proficient" where the documented fallback
    // for non-standard categories is to assume proficiency.
    for (const category of ['Simpler Weapon', 'Martialarts Weapon']) {
      const meta = gearMetaFromItem({ category, damage: '1d8', damageType: 'Slashing' });
      expect(meta).toMatchObject({ type: 'weapon' });
      expect(meta).not.toHaveProperty('weaponCategory');
    }
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

  it('does not resolve prototype-chain names as armor categories', () => {
    // Homebrew categories are free text; "constructor" must not hit
    // Object.prototype and snapshot a function as the armorType.
    for (const category of ['constructor', 'toString', 'valueOf']) {
      expect(gearMetaFromItem({ category, armorClass: '16', properties: [] })).toBeNull();
    }
  });
});

describe('isGearCategory', () => {
  it('is true for armor and weapon categories the derivation reads', () => {
    for (const category of [
      'Armor', // magic body armor + shields
      'Light Armor',
      'Medium Armor',
      'Heavy Armor',
      'Shield',
      'Weapon', // magic weapons
      'Simple Melee Weapon',
      'Martial Ranged Weapon',
    ]) {
      expect(isGearCategory(category)).toBe(true);
    }
  });

  it('is false for non-gear categories', () => {
    for (const category of ['Adventuring Gear', 'Equipment Pack', 'Potion', 'Wondrous Item']) {
      expect(isGearCategory(category)).toBe(false);
    }
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
    const inv = [item({ name: 'Leather Armor', gear: bodyArmorGear({ baseArmorClass: 11 }) })];
    expect(deriveArmorClass(inv, 3, null)).toMatchObject({
      derived: 14,
      breakdown: { base: 11, dexApplied: 3, shield: 0, armorType: 'light' },
    });
  });

  it('caps Dex at +2 for medium armor', () => {
    const inv = [
      item({
        name: 'Chain Shirt',
        gear: bodyArmorGear({ armorType: 'medium', baseArmorClass: 13 }),
      }),
    ];
    expect(deriveArmorClass(inv, 3, null)).toMatchObject({
      derived: 15,
      breakdown: { base: 13, dexApplied: 2, shield: 0, armorType: 'medium' },
    });
  });

  it('applies a negative Dex modifier to medium armor (the cap is an upper bound)', () => {
    const inv = [
      item({
        name: 'Chain Shirt',
        gear: bodyArmorGear({ armorType: 'medium', baseArmorClass: 13 }),
      }),
    ];
    expect(deriveArmorClass(inv, -1, null)).toMatchObject({
      derived: 12,
      breakdown: { base: 13, dexApplied: -1, shield: 0, armorType: 'medium' },
    });
  });

  it('ignores Dex entirely for heavy armor', () => {
    const inv = [
      item({
        name: 'Plate Armor',
        gear: bodyArmorGear({ armorType: 'heavy', baseArmorClass: 18 }),
      }),
    ];
    expect(deriveArmorClass(inv, 3, null)).toMatchObject({
      derived: 18,
      breakdown: { base: 18, dexApplied: 0, shield: 0, armorType: 'heavy' },
    });
  });

  it('stacks a shield on top of body armor', () => {
    const inv = [
      item({ name: 'Chain Mail', gear: bodyArmorGear({ armorType: 'heavy', baseArmorClass: 16 }) }),
      item({ name: 'Shield', gear: shieldGear() }),
    ];
    expect(deriveArmorClass(inv, 1, null)).toMatchObject({
      derived: 18,
      breakdown: { base: 16, dexApplied: 0, shield: 2, armorType: 'heavy' },
    });
  });

  it('stacks a shield on unarmored AC', () => {
    const inv = [item({ name: 'Shield', gear: shieldGear() })];
    expect(deriveArmorClass(inv, 1, null)).toMatchObject({
      derived: 13,
      breakdown: { base: 10, dexApplied: 1, shield: 2, armorType: 'unarmored' },
    });
  });

  it('counts only the best shield when several are equipped', () => {
    const inv = [
      item({ name: 'Shield', gear: shieldGear() }),
      item({ name: 'Shield +1', gear: shieldGear({ armorClassBonus: 3 }) }),
    ];
    expect(deriveArmorClass(inv, 0, null)).toMatchObject({
      derived: 13,
      breakdown: { base: 10, dexApplied: 0, shield: 3, armorType: 'unarmored' },
    });
  });

  it('picks the body armor with the highest resulting AC when several are equipped', () => {
    const inv = [
      // Studded leather with Dex +3 → 15; plate → 18. Plate wins.
      item({ name: 'Studded Leather', gear: bodyArmorGear({ baseArmorClass: 12 }) }),
      item({
        name: 'Plate Armor',
        gear: bodyArmorGear({ armorType: 'heavy', baseArmorClass: 18 }),
      }),
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
        gear: bodyArmorGear({ armorType: 'heavy', baseArmorClass: 18 }),
      }),
      item({ name: 'Rope' }),
    ];
    expect(deriveArmorClass(inv, 2, null)).toMatchObject({
      derived: 12,
      breakdown: { armorType: 'unarmored' },
    });
  });

  it('lets a manual override win while still reporting the derived value', () => {
    const inv = [item({ name: 'Leather Armor', gear: bodyArmorGear({ baseArmorClass: 11 }) })];
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
      item({ name: 'Ring Mail', gear: bodyArmorGear({ armorType: 'heavy', baseArmorClass: 14 }) }),
    ];
    expect(deriveArmorClass(inv, 5, null)).toMatchObject({
      derived: 14,
      breakdown: { base: 14, dexApplied: 0, shield: 0, armorType: 'heavy' },
    });
    // Same for medium below the unarmored line: Hide 12 + capped 2 = 14, not 15.
    const hide = [
      item({
        name: 'Hide Armor',
        gear: bodyArmorGear({ armorType: 'medium', baseArmorClass: 12 }),
      }),
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

  it('still counts a legacy shield snapshot that carries baseArmorClass, not armorClassBonus (VEG-461)', () => {
    // Pre-VEG-461 rows persisted a shield's bonus as `baseArmorClass` (the old
    // overloaded field). Real snapshot data with this exact shape already lives
    // in character inventory JSON, so the derivation must keep reading it — a
    // regression here would silently drop +2 AC off every affected character.
    const legacyShield = {
      type: 'armor',
      armorType: 'shield',
      baseArmorClass: 2,
    } as unknown as ShieldGear;
    const inv = [item({ name: 'Shield', gear: legacyShield })];
    expect(deriveArmorClass(inv, 1, null)).toMatchObject({
      derived: 13,
      breakdown: { base: 10, dexApplied: 1, shield: 2, armorType: 'unarmored' },
    });
  });
});

describe('deriveWeapons', () => {
  const mods = { strength: 3, dexterity: 1 };

  it('derives a melee weapon from Strength (legacy tierless snapshot: proficiency assumed)', () => {
    const inv = [
      item({ name: 'Longsword', gear: weaponGear({ properties: ['Versatile (1d10)'] }) }),
    ];
    expect(deriveWeapons(inv, mods, 3, [])).toEqual([
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
    expect(deriveWeapons(inv, mods, 2, [])).toEqual([
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
    expect(deriveWeapons(inv, mods, 2, [])[0]).toMatchObject({
      attackBonus: '+5',
      damage: '1d4+3',
    });
    // Dex-favoured character flips it.
    expect(deriveWeapons(inv, { strength: 0, dexterity: 4 }, 2, [])[0]).toMatchObject({
      attackBonus: '+6',
      damage: '1d4+4',
    });
  });

  it('omits the damage suffix when the ability modifier is 0', () => {
    const inv = [
      item({ name: 'Mace', gear: weaponGear({ damage: '1d6', damageType: 'Bludgeoning' }) }),
    ];
    expect(deriveWeapons(inv, { strength: 0, dexterity: 0 }, 2, [])[0]).toMatchObject({
      attackBonus: '+2',
      damage: '1d6',
    });
  });

  it('formats a negative modifier into the damage string', () => {
    const inv = [
      item({ name: 'Club', gear: weaponGear({ damage: '1d4', damageType: 'Bludgeoning' }) }),
    ];
    expect(deriveWeapons(inv, { strength: -1, dexterity: 0 }, 2, [])[0]).toMatchObject({
      attackBonus: '+1',
      damage: '1d4-1',
    });
  });

  it('ignores unequipped weapons, armor, and gearless items', () => {
    const inv = [
      item({ name: 'Longsword', equipped: false, gear: weaponGear() }),
      item({ name: 'Leather Armor', gear: bodyArmorGear() }),
      item({ name: 'Rope' }),
    ];
    expect(deriveWeapons(inv, mods, 2, [])).toEqual([]);
  });

  it('preserves inventory order', () => {
    const inv = [
      item({ name: 'Longsword', gear: weaponGear() }),
      item({ name: 'Dagger', gear: weaponGear({ damage: '1d4', damageType: 'Piercing' }) }),
    ];
    expect(deriveWeapons(inv, mods, 2, []).map(w => w.name)).toEqual(['Longsword', 'Dagger']);
  });

  it('tolerates weapon gear missing its properties array (hand-edited row)', () => {
    const inv = [
      item({
        name: 'Old Sword',
        gear: { type: 'weapon', damage: '1d8', damageType: 'Slashing', ranged: false } as never,
      }),
    ];
    expect(deriveWeapons(inv, mods, 2, [])[0]).toMatchObject({
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
    expect(deriveWeapons(stringProps, mods, 2, [])[0]).toMatchObject({
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
    expect(deriveWeapons(mixedProps, { strength: 0, dexterity: 4 }, 2, [])[0]).toMatchObject({
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
    expect(deriveWeapons(inv, mods, 2, [], manual).map(w => w.name)).toEqual(['Dagger']);
  });

  it('tolerates null / name-less manual weapon entries (corrupt weapons column)', () => {
    const inv = [item({ name: 'Longsword', gear: weaponGear() })];
    const manual = [null, { damage: '1d8' }] as never;
    expect(deriveWeapons(inv, mods, 2, [], manual).map(w => w.name)).toEqual(['Longsword']);
  });

  it('skips equipped weapon rows with a non-string name or missing damage fields', () => {
    const inv = [
      // Name-less row: would crash the shadow match and render a nameless row.
      item({ name: undefined as never, gear: weaponGear() }),
      // Damage-less snapshot: would render literal "undefined" in the table.
      item({
        name: 'Broken Snapshot',
        gear: { type: 'weapon', ranged: false, properties: [] } as never,
      }),
      item({ name: 'Dagger', gear: weaponGear({ damage: '1d4', damageType: 'Piercing' }) }),
    ];
    expect(deriveWeapons(inv, mods, 2, []).map(w => w.name)).toEqual(['Dagger']);
  });

  describe('weapon proficiency (VEG-463)', () => {
    const martialSword = item({
      name: 'Longsword',
      gear: weaponGear({ weaponCategory: 'martial', properties: ['Versatile (1d10)'] }),
    });

    it('applies the proficiency bonus via a tier grant ("Martial weapons")', () => {
      expect(deriveWeapons([martialSword], mods, 3, ['Martial weapons'])[0]).toMatchObject({
        attackBonus: '+6',
        notes: 'Versatile (1d10)',
      });
    });

    it('matches tier grants case- and whitespace-insensitively', () => {
      expect(deriveWeapons([martialSword], mods, 3, ['  martial WEAPONS '])[0]).toMatchObject({
        attackBonus: '+6',
      });
    });

    it('applies the bonus via a pluralized name grant ("Longswords" → Longsword)', () => {
      expect(
        deriveWeapons([martialSword], mods, 3, ['Simple weapons', 'Longswords'])[0]
      ).toMatchObject({ attackBonus: '+6' });
    });

    it('matches the irregular "-ves" plural ("Quarterstaves" → Quarterstaff)', () => {
      const staff = item({
        name: 'Quarterstaff',
        gear: weaponGear({ damage: '1d6', damageType: 'Bludgeoning', weaponCategory: 'simple' }),
      });
      expect(deriveWeapons([staff], mods, 2, ['Quarterstaves'])[0]).toMatchObject({
        attackBonus: '+5',
      });
      // The regular "-s" plural the class seed data uses keeps working.
      expect(deriveWeapons([staff], mods, 2, ['Quarterstaffs'])[0]).toMatchObject({
        attackBonus: '+5',
      });
    });

    it('keeps regular "-ve" plurals intact ("Glaives" → Glaive)', () => {
      // The "-ves" → "-ff" staff-family fold must not consume the only "-ve"
      // weapon in the catalog: both singular candidates are kept.
      const glaive = item({
        name: 'Glaive',
        gear: weaponGear({ damage: '1d10', damageType: 'Slashing', weaponCategory: 'martial' }),
      });
      expect(deriveWeapons([glaive], mods, 2, ['Glaives'])[0]).toMatchObject({
        attackBonus: '+5',
      });
    });

    it('honors melee/ranged tier qualifiers ("Martial melee weapons")', () => {
      expect(deriveWeapons([martialSword], mods, 3, ['Martial melee weapons'])[0]).toMatchObject({
        attackBonus: '+6',
      });
      // The qualifier binds: a melee-only grant does not cover a ranged weapon.
      const bow = item({
        name: 'Longbow',
        gear: weaponGear({
          damage: '1d8',
          damageType: 'Piercing',
          ranged: true,
          weaponCategory: 'martial',
        }),
      });
      expect(deriveWeapons([bow], mods, 3, ['Martial melee weapons'])[0]).toMatchObject({
        attackBonus: '+1',
        notes: 'Not proficient',
      });
    });

    it('reorders 2014-style comma phrasing ("Crossbows, light" → Light Crossbow)', () => {
      const crossbow = item({
        name: 'Light Crossbow',
        gear: weaponGear({
          damage: '1d8',
          damageType: 'Piercing',
          ranged: true,
          weaponCategory: 'simple',
        }),
      });
      expect(deriveWeapons([crossbow], mods, 2, ['Crossbows, light'])[0]).toMatchObject({
        attackBonus: '+3',
      });
    });

    it('matches a name grant at a word boundary ("Longswords" covers variant names)', () => {
      // Adjective prefix ("Silvered Longsword") and trailing modifier
      // ("Longsword +1", "Dagger of Venom") both keep the base-weapon grant.
      for (const name of ['Silvered Longsword', 'Longsword +1']) {
        const variant = item({ name, gear: weaponGear({ weaponCategory: 'martial' }) });
        expect(deriveWeapons([variant], mods, 2, ['Longswords'])[0]).toMatchObject({
          attackBonus: '+5',
        });
      }
      const venomDagger = item({
        name: 'Dagger of Venom',
        gear: weaponGear({ damage: '1d4', damageType: 'Piercing', weaponCategory: 'simple' }),
      });
      expect(deriveWeapons([venomDagger], mods, 2, ['Daggers'])[0]).toMatchObject({
        attackBonus: '+5',
      });
      // Word boundary only — a grant does not cover a name that merely
      // contains it mid-word ("Swords" is not a Greatsword grant).
      const greatsword = item({
        name: 'Greatsword',
        gear: weaponGear({ damage: '2d6', weaponCategory: 'martial' }),
      });
      expect(deriveWeapons([greatsword], mods, 2, ['Swords'])[0]).toMatchObject({
        notes: 'Not proficient',
      });
    });

    it('splits comma-separated grant lists ("Simple weapons, shortswords")', () => {
      // TokenListEditor stores a pasted SRD line as ONE token; both the tier
      // part and the name part must still grant, and a trailing comma is inert.
      const club = item({
        name: 'Club',
        gear: weaponGear({ damage: '1d4', damageType: 'Bludgeoning', weaponCategory: 'simple' }),
      });
      const shortsword = item({
        name: 'Shortsword',
        gear: weaponGear({ damage: '1d6', damageType: 'Piercing', weaponCategory: 'martial' }),
      });
      const grants = ['Simple weapons, shortswords'];
      expect(deriveWeapons([club, shortsword], mods, 2, grants)).toEqual([
        expect.objectContaining({ name: 'Club', attackBonus: '+5' }),
        expect.objectContaining({ name: 'Shortsword', attackBonus: '+5' }),
      ]);
      expect(deriveWeapons([club], mods, 2, ['Simple weapons,'])[0]).toMatchObject({
        attackBonus: '+5',
      });
    });

    it('accepts common tier-phrase variants ("All martial weapons", "Simple and martial weapons", trailing punctuation)', () => {
      const club = item({
        name: 'Club',
        gear: weaponGear({ damage: '1d4', damageType: 'Bludgeoning', weaponCategory: 'simple' }),
      });
      expect(deriveWeapons([martialSword], mods, 3, ['All martial weapons'])[0]).toMatchObject({
        attackBonus: '+6',
      });
      expect(deriveWeapons([martialSword], mods, 3, ['Martial weapons.'])[0]).toMatchObject({
        attackBonus: '+6',
      });
      expect(
        deriveWeapons([club, martialSword], mods, 3, ['Simple and martial weapons']).map(
          w => w.attackBonus
        )
      ).toEqual(['+6', '+6']);
    });

    it('does not let a non-weapon grant confer proficiency by word-boundary coincidence', () => {
      // "Shields" is an armor grant; a homebrew martial "Spiked Shield" must
      // not inherit weapon proficiency from it.
      const spikedShield = item({
        name: 'Spiked Shield',
        gear: weaponGear({ damage: '1d6', damageType: 'Piercing', weaponCategory: 'martial' }),
      });
      expect(deriveWeapons([spikedShield], mods, 2, ['Shields'])[0]).toMatchObject({
        notes: 'Not proficient',
      });
    });

    it('matches multi-word name grants ("Light crossbows" → Light Crossbow)', () => {
      const crossbow = item({
        name: 'Light Crossbow',
        gear: weaponGear({
          damage: '1d8',
          damageType: 'Piercing',
          ranged: true,
          weaponCategory: 'simple',
        }),
      });
      expect(deriveWeapons([crossbow], mods, 2, ['Light crossbows'])[0]).toMatchObject({
        attackBonus: '+3',
      });
    });

    it('derives without the bonus and notes "Not proficient" when nothing grants the tiered weapon', () => {
      // A wizard's grants: specific simple weapons only — no martial tier, no longsword.
      const wizardGrants = ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'];
      expect(deriveWeapons([martialSword], mods, 3, wizardGrants)).toEqual([
        {
          name: 'Longsword',
          attackBonus: '+3',
          damage: '1d8+3',
          damageType: 'Slashing',
          notes: 'Not proficient, Versatile (1d10)',
        },
      ]);
    });

    it('does not let a simple-tier grant cover a martial weapon', () => {
      expect(deriveWeapons([martialSword], mods, 3, ['Simple weapons'])[0]).toMatchObject({
        attackBonus: '+3',
        notes: 'Not proficient, Versatile (1d10)',
      });
    });

    it('notes "Not proficient" alone on a property-less weapon lacking a grant', () => {
      const club = item({
        name: 'Club',
        gear: weaponGear({ damage: '1d4', damageType: 'Bludgeoning', weaponCategory: 'simple' }),
      });
      expect(deriveWeapons([club], mods, 2, [])[0]).toMatchObject({
        attackBonus: '+3',
        notes: 'Not proficient',
      });
    });

    it('still applies the finesse/ranged ability rules to a non-proficient weapon', () => {
      const rapier = item({
        name: 'Rapier',
        gear: weaponGear({
          damage: '1d8',
          damageType: 'Piercing',
          properties: ['Finesse'],
          weaponCategory: 'martial',
        }),
      });
      expect(deriveWeapons([rapier], { strength: 0, dexterity: 4 }, 2, [])[0]).toMatchObject({
        attackBonus: '+4',
        damage: '1d8+4',
        notes: 'Not proficient, Finesse',
      });
    });

    it('assumes proficiency for a legacy snapshot without a tier (pre-VEG-463 rows)', () => {
      // Without a tier we cannot prove non-proficiency; stripping the bonus
      // would wrongly hit e.g. a Fighter, whose grants are tier phrases only.
      const legacy = item({ name: 'Longsword', gear: weaponGear() });
      expect(deriveWeapons([legacy], mods, 3, [])[0]).toMatchObject({ attackBonus: '+6' });
    });

    it('tolerates non-string grant entries without crashing or granting', () => {
      const grants = [null, 7, "Thieves' tools"] as never;
      expect(deriveWeapons([martialSword], mods, 3, grants)[0]).toMatchObject({
        attackBonus: '+3',
        notes: 'Not proficient, Versatile (1d10)',
      });
    });
  });
});
