import { npcAlignmentPriors, NPC_ALIGNMENT_ORDER } from './npc-alignment-priors';

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

describe('NPC alignment priors seed data', () => {
  it('encodes the alignment order as the canonical 9-vector', () => {
    expect(NPC_ALIGNMENT_ORDER).toEqual([
      'Lawful Good',
      'Neutral Good',
      'Chaotic Good',
      'Lawful Neutral',
      'Neutral',
      'Chaotic Neutral',
      'Lawful Evil',
      'Neutral Evil',
      'Chaotic Evil',
    ]);
  });

  it('has every entry shaped as { race, background?, weights[9] }', () => {
    for (const prior of npcAlignmentPriors) {
      expect(typeof prior.race).toBe('string');
      expect(prior.race.length).toBeGreaterThan(0);
      expect(prior.background === null || typeof prior.background === 'string').toBe(true);
      expect(Array.isArray(prior.weights)).toBe(true);
      expect(prior.weights).toHaveLength(NPC_ALIGNMENT_ORDER.length);
    }
  });

  it('has no negative weights', () => {
    for (const prior of npcAlignmentPriors) {
      for (const w of prior.weights) {
        expect(w).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('has at least one positive weight per row (sum > 0)', () => {
    for (const prior of npcAlignmentPriors) {
      const sum = prior.weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0);
    }
  });

  it('has no duplicate (race, background) tuples', () => {
    const seen = new Set<string>();
    for (const prior of npcAlignmentPriors) {
      const id = `${prior.race}::${prior.background ?? ''}`;
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it.each(SRD_521_SPECIES)('has a default (race=%s, background=null) row', species => {
    const def = npcAlignmentPriors.find(p => p.race === species && p.background === null);
    expect(def).toBeDefined();
  });

  it('only references SRD 5.2.1 species', () => {
    const races = new Set(npcAlignmentPriors.map(p => p.race));
    for (const race of races) {
      expect(SRD_521_SPECIES).toContain(race);
    }
  });
});
