// Curated dropdown options for the NPC generator forms.
// "Other" lets the DM type a free-text value not in this list.

export const NPC_RACES = [
  'Human',
  'Elf',
  'Dwarf',
  'Halfling',
  'Gnome',
  'Half-Elf',
  'Half-Orc',
  'Tiefling',
  'Dragonborn',
] as const;

export const NPC_PROFESSIONS = [
  'Peasant',
  'Soldier',
  'Blacksmith',
  'Merchant',
  'Innkeeper',
  'Scholar',
  'Priest',
  'Bandit',
  'Noble',
  'Sailor',
  'Hunter',
  'Mage',
] as const;

export const NPC_ALIGNMENTS = [
  'Lawful Good',
  'Neutral Good',
  'Chaotic Good',
  'Lawful Neutral',
  'True Neutral',
  'Chaotic Neutral',
  'Lawful Evil',
  'Neutral Evil',
  'Chaotic Evil',
] as const;

export const NPC_HOSTILITIES = ['friendly', 'neutral', 'hostile'] as const;
