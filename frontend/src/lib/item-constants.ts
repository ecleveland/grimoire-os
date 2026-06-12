// The exact category values present in the seeded catalog: the basic-equipment
// categories extracted by VEG-308 plus the magic-item categories (VEG-164).
// The API filter matches equality, so these must mirror the data verbatim.
// Homebrew items (VEG-296) pick from the same list so they slot into the
// existing category filter.
export const ITEM_CATEGORIES = [
  'Adventuring Gear',
  'Airborne or Waterborne Vehicle',
  'Ammunition',
  'Arcane Focus',
  'Armor',
  "Artisan's Tools",
  'Druidic Focus',
  'Equipment Pack',
  'Food, Drink, or Lodging',
  'Gaming Set',
  'Heavy Armor',
  'Holy Symbol',
  'Lifestyle Expense',
  'Light Armor',
  'Martial Melee Weapon',
  'Martial Ranged Weapon',
  'Medium Armor',
  'Mount',
  'Musical Instrument',
  'Potion',
  'Ring',
  'Rod',
  'Scroll',
  'Service',
  'Shield',
  'Simple Melee Weapon',
  'Simple Ranged Weapon',
  'Staff',
  'Tack, Harness, or Drawn Vehicle',
  'Tool',
  'Wand',
  'Weapon',
  'Wondrous Item',
];

/** The SRD 5.2.1 magic-item rarity ladder, as stored in the `rarity` column. */
export const ITEM_RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact'];
