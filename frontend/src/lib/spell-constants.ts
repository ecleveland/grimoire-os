/**
 * Canonical 5e spell school/class/level lists (VEG-294).
 *
 * SPELL_SCHOOLS and SPELL_LEVELS are shared by the search-page filters, the
 * browse-page filters, and the homebrew create/edit form. SRD_CLASSES feeds
 * the filter dropdowns only — the create/edit form takes classes as free-text
 * comma-separated input, so homebrew spells may reference any class.
 */

export const SRD_CLASSES = [
  'Bard',
  'Cleric',
  'Druid',
  'Paladin',
  'Ranger',
  'Sorcerer',
  'Warlock',
  'Wizard',
];

export const SPELL_SCHOOLS = [
  'Abjuration',
  'Conjuration',
  'Divination',
  'Enchantment',
  'Evocation',
  'Illusion',
  'Necromancy',
  'Transmutation',
];

export const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Display label for a spell level: 0 is a cantrip, everything else "Level N". */
export function levelLabel(level: number): string {
  return level === 0 ? 'Cantrip' : `Level ${level}`;
}
