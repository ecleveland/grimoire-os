import {
  npcAppearanceTraits,
  NPC_APPEARANCE_CATEGORIES,
} from './npc-appearance-traits';

const SRD_521_SPECIES = [
  'Dragonborn',
  'Dwarf',
  'Elf',
  'Gnome',
  'Goliath',
  'Halfling',
  'Human',
  'Orc',
  'Tiefling',
];

function entriesFor(race: string, category: string) {
  return npcAppearanceTraits.filter(t => t.race === race && t.category === category);
}

describe('NPC appearance traits seed data', () => {
  it('uses only the documented categories', () => {
    for (const trait of npcAppearanceTraits) {
      expect(NPC_APPEARANCE_CATEGORIES).toContain(trait.category);
    }
  });

  it('has every entry shaped as { race, category, trait }', () => {
    for (const trait of npcAppearanceTraits) {
      expect(typeof trait.race).toBe('string');
      expect(trait.race.length).toBeGreaterThan(0);
      expect(typeof trait.category).toBe('string');
      expect(typeof trait.trait).toBe('string');
      expect(trait.trait.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate (race, category, trait) tuples', () => {
    const seen = new Set<string>();
    for (const t of npcAppearanceTraits) {
      const id = `${t.race}::${t.category}::${t.trait}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  describe.each(SRD_521_SPECIES)('species %s', species => {
    it.each(NPC_APPEARANCE_CATEGORIES)('has at least 10 %s entries', category => {
      const rows = entriesFor(species, category);
      expect(rows.length).toBeGreaterThanOrEqual(10);
    });
  });

  it('only references SRD 5.2.1 species (no orphan races)', () => {
    const races = new Set(npcAppearanceTraits.map(t => t.race));
    for (const race of races) {
      expect(SRD_521_SPECIES).toContain(race);
    }
  });
});
