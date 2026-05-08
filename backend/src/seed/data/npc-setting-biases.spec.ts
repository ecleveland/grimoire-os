import { npcSettingBiases } from './npc-setting-biases';

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

describe('NPC setting biases seed data', () => {
  it('exports the documented setting keys', () => {
    const keys = Object.keys(npcSettingBiases);
    for (const expected of [
      'dwarven mine',
      'nine hells',
      'elven forest',
      'coastal city',
      'desert oasis',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it('uses lowercase setting keys', () => {
    for (const key of Object.keys(npcSettingBiases)) {
      expect(key).toBe(key.toLowerCase());
    }
  });

  it('every weight is a positive number', () => {
    for (const [, biases] of Object.entries(npcSettingBiases)) {
      for (const [, weight] of Object.entries(biases)) {
        expect(typeof weight).toBe('number');
        expect(weight).toBeGreaterThan(0);
      }
    }
  });

  it('every race in a bias map is an SRD 5.2.1 species', () => {
    for (const biases of Object.values(npcSettingBiases)) {
      for (const race of Object.keys(biases)) {
        expect(SRD_521_SPECIES).toContain(race);
      }
    }
  });

  it('every setting has at least one race weight', () => {
    for (const [setting, biases] of Object.entries(npcSettingBiases)) {
      expect(Object.keys(biases).length).toBeGreaterThan(0);
      // Witness so error message points at the failing setting if any
      expect(setting).toBeTruthy();
    }
  });
});
