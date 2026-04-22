import * as fs from 'fs';
import * as path from 'path';
import {
  loadSpellsFromJson,
  loadMonstersFromJson,
  loadMagicItemsFromJson,
  loadSpeciesAsRacesFromJson,
} from './srd-json.loader';

jest.mock('fs');

const mockReadFileSync = fs.readFileSync as jest.MockedFunction<typeof fs.readFileSync>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

function mockJsonFile(filename: string, data: unknown) {
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockImplementation((filePath: fs.PathOrFileDescriptor) => {
    if (String(filePath).endsWith(filename)) {
      return JSON.stringify(data);
    }
    throw new Error(`Unexpected file read: ${filePath}`);
  });
}

describe('srd-json.loader', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('loadSpellsFromJson', () => {
    const sampleSpellsJson = {
      metadata: { source: 'SRD 5.2.1', total_count: 2 },
      spells: [
        {
          name: 'Acid Arrow',
          level: 2,
          school: 'Evocation',
          classes: ['Wizard'],
          casting_time: 'Action',
          ritual: false,
          range: '90 feet',
          components: {
            verbal: true,
            somatic: true,
            material: true,
            material_description: 'powdered rhubarb leaf',
          },
          duration: 'Instantaneous',
          concentration: false,
          description: 'A shimmering green arrow.',
          higher_levels: 'Damage increases by 1d4.',
          cantrip_upgrade: null,
        },
        {
          name: 'Acid Splash',
          level: 0,
          school: 'Evocation',
          classes: ['Sorcerer', 'Wizard'],
          casting_time: 'Action',
          ritual: false,
          range: '60 feet',
          components: {
            verbal: true,
            somatic: true,
            material: false,
            material_description: null,
          },
          duration: 'Instantaneous',
          concentration: false,
          description: 'You create an acidic bubble.',
          higher_levels: null,
          cantrip_upgrade: 'Damage increases by 1d6 at levels 5, 11, and 17.',
        },
      ],
    };

    beforeEach(() => mockJsonFile('spells.json', sampleSpellsJson));

    it('maps snake_case fields to camelCase Prisma fields', () => {
      const spells = loadSpellsFromJson();
      expect(spells[0]).toMatchObject({
        name: 'Acid Arrow',
        level: 2,
        school: 'Evocation',
        castingTime: 'Action',
        range: '90 feet',
        duration: 'Instantaneous',
        concentration: false,
        ritual: false,
        classes: ['Wizard'],
      });
    });

    it('converts components object to string and extracts material', () => {
      const spells = loadSpellsFromJson();
      expect(spells[0].components).toBe('V, S, M');
      expect(spells[0].material).toBe('powdered rhubarb leaf');
    });

    it('handles non-material components', () => {
      const spells = loadSpellsFromJson();
      expect(spells[1].components).toBe('V, S');
      expect(spells[1].material).toBeNull();
    });

    it('maps higher_levels to higherLevels', () => {
      const spells = loadSpellsFromJson();
      expect(spells[0].higherLevels).toBe('Damage increases by 1d4.');
      expect(spells[1].higherLevels).toBeNull();
    });

    it('appends cantrip_upgrade to description when present', () => {
      const spells = loadSpellsFromJson();
      expect(spells[1].description).toContain('You create an acidic bubble.');
      expect(spells[1].description).toContain('Damage increases by 1d6');
    });

    it('returns correct count', () => {
      const spells = loadSpellsFromJson();
      expect(spells).toHaveLength(2);
    });
  });

  describe('loadMonstersFromJson', () => {
    const sampleMonstersJson = {
      metadata: { source: 'SRD 5.2.1', total_count: 2 },
      monsters: [
        {
          name: 'Aboleth',
          size: 'Large',
          type: 'Aberration',
          alignment: 'Lawful Evil',
          armor_class: 17,
          armor_description: null,
          hit_points: { average: 150, formula: '20d10 + 40' },
          speed: { walk: 10, fly: null, swim: 40, climb: null, burrow: null, hover: false },
          ability_scores: {
            strength: { score: 21, modifier: 5, save: 5 },
            dexterity: { score: 9, modifier: -1, save: 3 },
            constitution: { score: 15, modifier: 2, save: 6 },
            intelligence: { score: 18, modifier: 4, save: 8 },
            wisdom: { score: 15, modifier: 2, save: 6 },
            charisma: { score: 18, modifier: 4, save: 4 },
          },
          skills: { History: '+12', Perception: '+10' },
          damage_resistances: null,
          damage_immunities: null,
          damage_vulnerabilities: null,
          condition_immunities: null,
          senses: 'Darkvision 120 ft.; Passive Perception 20',
          languages: 'Deep Speech; telepathy 120 ft.',
          challenge_rating: '10',
          xp: 5900,
          proficiency_bonus: 4,
          traits: [{ name: 'Amphibious', description: 'Can breathe air and water.', usage: null }],
          actions: [
            {
              name: 'Tentacle',
              description: 'Melee Attack Roll: +9',
              attack_type: 'Melee',
              to_hit: 9,
              reach: '15 ft.',
              range: null,
              damage: '12 (2d6 + 5)',
              usage: null,
            },
          ],
          reactions: [{ name: 'Slimy Retort', description: 'Slime reaction.', usage: null }],
          legendary_actions: {
            description: 'Legendary Action Uses: 3.',
            actions: [
              {
                name: 'Lash',
                description: 'Makes one Tentacle attack.',
                attack_type: null,
                to_hit: null,
                reach: null,
                range: null,
                damage: null,
                usage: null,
              },
            ],
          },
        },
        {
          name: 'Giant Rat',
          size: 'Small',
          type: 'Beast',
          alignment: 'Unaligned',
          armor_class: 12,
          armor_description: null,
          hit_points: { average: 7, formula: '2d6' },
          speed: { walk: 30, fly: null, swim: null, climb: null, burrow: null, hover: false },
          ability_scores: {
            strength: { score: 7, modifier: -2, save: -2 },
            dexterity: { score: 15, modifier: 2, save: 2 },
            constitution: { score: 11, modifier: 0, save: 0 },
            intelligence: { score: 2, modifier: -4, save: -4 },
            wisdom: { score: 10, modifier: 0, save: 0 },
            charisma: { score: 4, modifier: -3, save: -3 },
          },
          skills: null,
          damage_resistances: null,
          damage_immunities: null,
          damage_vulnerabilities: null,
          condition_immunities: null,
          senses: 'Darkvision 60 ft.; Passive Perception 10',
          languages: 'None',
          challenge_rating: '1/4',
          xp: 50,
          proficiency_bonus: 2,
          traits: null,
          actions: [
            {
              name: 'Bite',
              description: 'Melee Attack Roll: +4',
              attack_type: 'Melee',
              to_hit: 4,
              reach: '5 ft.',
              range: null,
              damage: '4 (1d4 + 2)',
              usage: null,
            },
          ],
          reactions: null,
          legendary_actions: null,
        },
      ],
    };

    beforeEach(() => mockJsonFile('monsters.json', sampleMonstersJson));

    it('maps ability scores to flat fields', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[0]).toMatchObject({
        str: 21,
        dex: 9,
        con: 15,
        int: 18,
        wis: 15,
        cha: 18,
      });
    });

    it('derives saving throws from save vs modifier difference', () => {
      const monsters = loadMonstersFromJson();
      // Aboleth: str save=5 mod=5 (no), dex save=3 mod=-1 (yes), con save=6 mod=2 (yes),
      // int save=8 mod=4 (yes), wis save=6 mod=2 (yes), cha save=4 mod=4 (no)
      expect(monsters[0].savingThrows).toEqual({
        DEX: 3,
        CON: 6,
        INT: 8,
        WIS: 6,
      });
    });

    it('sets savingThrows to null when no proficiencies', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[1].savingThrows).toBeNull();
    });

    it('parses skills string values to numbers', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[0].skills).toEqual({ History: 12, Perception: 10 });
    });

    it('sets skills to null when source is null', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[1].skills).toBeNull();
    });

    it('converts speed object to string', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[0].speed).toBe('10 ft., swim 40 ft.');
      expect(monsters[1].speed).toBe('30 ft.');
    });

    it('maps hit_points to hitPoints and hitDice', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[0].hitPoints).toBe(150);
      expect(monsters[0].hitDice).toBe('20d10 + 40');
    });

    it('parses fractional challenge ratings', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[0].challengeRating).toBe(10);
      expect(monsters[1].challengeRating).toBe(0.25);
    });

    it('maps traits to specialAbilities, keeping only name and description', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[0].specialAbilities).toEqual([
        { name: 'Amphibious', description: 'Can breathe air and water.' },
      ]);
    });

    it('maps actions keeping only name and description', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[0].actions).toEqual([
        { name: 'Tentacle', description: 'Melee Attack Roll: +9' },
      ]);
    });

    it('maps reactions keeping only name and description', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[0].reactions).toEqual([
        { name: 'Slimy Retort', description: 'Slime reaction.' },
      ]);
    });

    it('converts null arrays to empty arrays for damage/condition fields', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[0].damageResistances).toEqual([]);
      expect(monsters[0].damageImmunities).toEqual([]);
      expect(monsters[0].damageVulnerabilities).toEqual([]);
      expect(monsters[0].conditionImmunities).toEqual([]);
    });

    it('extracts legendary actions from nested object structure', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[0].legendaryActions).toEqual([
        { name: 'Lash', description: 'Makes one Tentacle attack.' },
      ]);
    });

    it('sets null specialAbilities/actions/reactions/legendaryActions when source is null', () => {
      const monsters = loadMonstersFromJson();
      expect(monsters[1].specialAbilities).toBeNull();
      expect(monsters[1].legendaryActions).toBeNull();
    });
  });

  describe('loadMagicItemsFromJson', () => {
    const sampleMagicItemsJson = {
      metadata: { source: 'SRD 5.2.1', count: 2 },
      magic_items: [
        {
          name: 'Adamantine Armor',
          category: 'Armor',
          subcategory: 'Any Medium or Heavy, Except Hide Armor',
          rarity: 'Uncommon',
          rarity_by_variant: null,
          requires_attunement: false,
          attunement_restriction: null,
          description: 'Reinforced with adamantine.',
          charges: null,
          spells: null,
          variants: null,
          tables: null,
        },
        {
          name: 'Cloak of Protection',
          category: 'Wondrous Item',
          subcategory: null,
          rarity: 'Uncommon',
          rarity_by_variant: null,
          requires_attunement: true,
          attunement_restriction: null,
          description: 'You gain a +1 bonus to AC and saving throws.',
          charges: null,
          spells: null,
          variants: null,
          tables: null,
        },
      ],
    };

    beforeEach(() => mockJsonFile('magic_items.json', sampleMagicItemsJson));

    it('maps fields to Prisma Item shape with isMagic true', () => {
      const items = loadMagicItemsFromJson();
      expect(items[0]).toMatchObject({
        name: 'Adamantine Armor',
        category: 'Armor',
        description: 'Reinforced with adamantine.',
        rarity: 'Uncommon',
        requiresAttunement: false,
        isMagic: true,
      });
    });

    it('includes subcategory in properties when present', () => {
      const items = loadMagicItemsFromJson();
      expect(items[0].properties).toContain('Any Medium or Heavy, Except Hide Armor');
      expect(items[1].properties).toEqual([]);
    });

    it('maps requires_attunement to requiresAttunement', () => {
      const items = loadMagicItemsFromJson();
      expect(items[0].requiresAttunement).toBe(false);
      expect(items[1].requiresAttunement).toBe(true);
    });

    it('returns correct count', () => {
      const items = loadMagicItemsFromJson();
      expect(items).toHaveLength(2);
    });
  });

  describe('loadSpeciesAsRacesFromJson', () => {
    const sampleSpeciesJson = {
      metadata: { source: 'SRD 5.2.1', count: 2 },
      species: [
        {
          name: 'Dwarf',
          creature_type: 'Humanoid',
          size: 'Medium',
          size_description: 'about 4-5 feet tall',
          speed: 30,
          traits: [
            {
              name: 'Darkvision',
              description: 'You have Darkvision with a range of 120 feet.',
              options: null,
              table: null,
            },
            {
              name: 'Dwarven Resilience',
              description: 'You have Resistance to Poison damage.',
              options: null,
              table: null,
            },
          ],
        },
        {
          name: 'Human',
          creature_type: 'Humanoid',
          size: 'Medium or Small',
          size_description: 'Medium (about 4-7 feet tall) or Small',
          speed: 30,
          traits: [
            {
              name: 'Resourceful',
              description: 'You gain Heroic Inspiration whenever you finish a Long Rest.',
              options: null,
              table: null,
            },
          ],
        },
      ],
    };

    beforeEach(() => mockJsonFile('species.json', sampleSpeciesJson));

    it('maps species to Race Prisma shape', () => {
      const races = loadSpeciesAsRacesFromJson();
      expect(races[0]).toMatchObject({
        name: 'Dwarf',
        speed: 30,
        size: 'Medium',
        sizeDescription: 'about 4-5 feet tall',
      });
    });

    it('maps traits as JSON-compatible array with name and description', () => {
      const races = loadSpeciesAsRacesFromJson();
      expect(races[0].traits).toEqual([
        { name: 'Darkvision', description: 'You have Darkvision with a range of 120 feet.' },
        { name: 'Dwarven Resilience', description: 'You have Resistance to Poison damage.' },
      ]);
    });

    it('sets languages to Common by default', () => {
      const races = loadSpeciesAsRacesFromJson();
      expect(races[0].languages).toEqual(['Common']);
    });

    it('returns correct count', () => {
      const races = loadSpeciesAsRacesFromJson();
      expect(races).toHaveLength(2);
    });
  });
});
