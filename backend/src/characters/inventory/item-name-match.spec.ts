import {
  normalizeItemName,
  buildItemNameIndex,
  lookupItemByName,
  ITEM_NAME_ALIASES,
  ResolvableItem,
} from './item-name-match';

const item = (over: Partial<ResolvableItem> & { id: string; name: string }): ResolvableItem => ({
  category: 'Adventuring Gear',
  armorClass: null,
  damage: null,
  damageType: null,
  properties: [],
  stealthDisadvantage: null,
  strengthRequirement: null,
  ...over,
});

const CHAIN_MAIL = item({
  id: 'srd-chain-mail',
  name: 'Chain Mail',
  category: 'Heavy Armor',
  armorClass: '16',
  stealthDisadvantage: true,
  strengthRequirement: 13,
});

const SHIELD = item({ id: 'srd-shield', name: 'Shield', category: 'Shield', armorClass: '+2' });

describe('normalizeItemName', () => {
  it('lowercases so seed casing matches catalog casing', () => {
    expect(normalizeItemName('Chain mail')).toBe(normalizeItemName('Chain Mail'));
  });

  it('folds typographic apostrophes to ASCII', () => {
    // Seed data writes "Dungeoneer's pack" (U+0027); the catalog has
    // "Dungeoneer’s Pack" (U+2019). Same item, different keystroke.
    expect(normalizeItemName("Dungeoneer's pack")).toBe(normalizeItemName('Dungeoneer’s Pack'));
    expect(normalizeItemName('Thieves‘ Tools')).toBe(normalizeItemName("Thieves' tools"));
  });

  it('collapses internal whitespace runs and trims', () => {
    expect(normalizeItemName('  Chain   Mail  ')).toBe(normalizeItemName('Chain Mail'));
  });

  it('does not strip plurals or parentheticals', () => {
    // The bright line: exact match after Unicode/case folding, never fuzzy.
    // Relaxing this is the first step toward "Any simple weapon" matching a
    // real item, which would silently arm a placeholder line.
    expect(normalizeItemName('Arrow')).not.toBe(normalizeItemName('Arrows (20)'));
    expect(normalizeItemName('Shield')).not.toBe(normalizeItemName('Wooden shield'));
  });
});

describe('buildItemNameIndex', () => {
  it('indexes a uniquely-named row under its normalized name', () => {
    const index = buildItemNameIndex([CHAIN_MAIL]);
    expect(index.get(normalizeItemName('Chain mail'))).toEqual(CHAIN_MAIL);
  });

  it('drops a normalized name claimed by two rows rather than picking one', () => {
    const dup = item({ id: 'other-chain-mail', name: 'chain mail', category: 'Heavy Armor' });
    const index = buildItemNameIndex([CHAIN_MAIL, dup]);
    expect(index.has(normalizeItemName('Chain Mail'))).toBe(false);
  });

  it('keeps an ambiguous name dropped when a third row claims it', () => {
    // Sticky: a naive delete-on-second would let the third sighting re-add it.
    const dup = item({ id: 'b', name: 'chain mail', category: 'Heavy Armor' });
    const dup2 = item({ id: 'c', name: 'CHAIN MAIL', category: 'Heavy Armor' });
    const index = buildItemNameIndex([CHAIN_MAIL, dup, dup2]);
    expect(index.has(normalizeItemName('Chain Mail'))).toBe(false);
  });
});

describe('lookupItemByName', () => {
  const index = buildItemNameIndex([CHAIN_MAIL, SHIELD]);

  it('resolves a seed-cased name to the catalog row', () => {
    expect(lookupItemByName(index, 'Chain mail')).toEqual(CHAIN_MAIL);
  });

  it('resolves an aliased seed name to its catalog counterpart', () => {
    // "Wooden shield" (Druid, classes.ts) has no catalog row; "Shield" is it.
    expect(lookupItemByName(index, 'Wooden shield')).toEqual(SHIELD);
  });

  it('returns undefined for a placeholder line', () => {
    expect(lookupItemByName(index, 'Any martial melee weapon')).toBeUndefined();
  });

  it('returns undefined for a name with no catalog row', () => {
    expect(lookupItemByName(index, 'Spellbook')).toBeUndefined();
  });

  it.each(['constructor', 'Constructor', '__proto__', 'toString', 'valueOf'])(
    'treats %p as an ordinary unmatched name',
    name => {
      // Item names are free user input. A prototype-key lookup on the alias
      // table would return a function/object, pass a truthy guard, and throw
      // inside normalization — turning POST /characters into a 500 for anyone
      // who names an item "constructor".
      expect(() => lookupItemByName(index, name)).not.toThrow();
      expect(lookupItemByName(index, name)).toBeUndefined();
    }
  );
});

describe('ITEM_NAME_ALIASES', () => {
  it('is keyed by normalized name', () => {
    for (const key of ITEM_NAME_ALIASES.keys()) {
      expect(key).toBe(normalizeItemName(key));
    }
  });

  it('covers only gear-relevant divergences', () => {
    // Every other seed/catalog mismatch denotes something gearMetaFromItem
    // maps to null (ammunition, focus families, packs), so aliasing it would
    // add maintenance burden for zero derived-stat benefit. Keep this tight.
    expect([...ITEM_NAME_ALIASES.keys()]).toEqual(['wooden shield']);
  });
});
