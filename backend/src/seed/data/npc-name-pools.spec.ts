import { npcNamePools, NpcNamePoolEntry, NPC_NAME_KINDS } from './npc-name-pools';

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

function entriesFor(race: string, kind: string, gender?: string | null): NpcNamePoolEntry[] {
  return npcNamePools.filter(
    e =>
      e.race === race &&
      e.kind === kind &&
      (gender === undefined ? true : (e.gender ?? null) === gender)
  );
}

describe('NPC name pools seed data', () => {
  it('uses only the documented kinds (first | family | epithet)', () => {
    for (const entry of npcNamePools) {
      expect(NPC_NAME_KINDS).toContain(entry.kind);
    }
  });

  it('has every entry shaped as { race, gender?, kind, value }', () => {
    for (const entry of npcNamePools) {
      expect(typeof entry.race).toBe('string');
      expect(entry.race.length).toBeGreaterThan(0);
      expect(typeof entry.kind).toBe('string');
      expect(typeof entry.value).toBe('string');
      expect(entry.value.length).toBeGreaterThan(0);
      expect(entry.gender === null || typeof entry.gender === 'string').toBe(true);
    }
  });

  it('has no duplicate (race, gender, kind, value) tuples', () => {
    const seen = new Set<string>();
    for (const entry of npcNamePools) {
      const id = `${entry.race}::${entry.gender ?? ''}::${entry.kind}::${entry.value}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  describe.each(SRD_521_SPECIES)('species %s', species => {
    it('has at least 30 male first names', () => {
      const rows = entriesFor(species, 'first', 'male');
      expect(rows.length).toBeGreaterThanOrEqual(30);
    });

    it('has at least 30 female first names', () => {
      const rows = entriesFor(species, 'first', 'female');
      expect(rows.length).toBeGreaterThanOrEqual(30);
    });

    it('has at least 10 family names', () => {
      const rows = entriesFor(species, 'family', null);
      expect(rows.length).toBeGreaterThanOrEqual(10);
    });
  });

  it('only references SRD 5.2.1 species (no orphan races)', () => {
    const races = new Set(npcNamePools.map(e => e.race));
    for (const race of races) {
      expect(SRD_521_SPECIES).toContain(race);
    }
  });
});
