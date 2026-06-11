import * as fs from 'fs';
import * as path from 'path';
import {
  loadSpellsFromJson,
  loadMonstersFromJson,
  loadMagicItemsFromJson,
  loadEquipmentFromJson,
  loadSpeciesAsRacesFromJson,
  validateMonsterData,
  trailingForeignTitle,
  danglingFragmentTail,
  flattenedTableSignals,
  validateSpellData,
  validateMagicItemData,
  validateSpeciesData,
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
    throw new Error(`Unexpected file read: ${String(filePath)}`);
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

  describe('validateMonsterData', () => {
    // Minimal monster the guard considers valid; override the field under test.
    function monster(over: Record<string, unknown> = {}) {
      return {
        name: 'Test Monster',
        type: 'Aberration',
        damage_resistances: null,
        damage_immunities: null,
        damage_vulnerabilities: null,
        condition_immunities: null,
        legendary_actions: null,
        ...over,
      } as unknown as Parameters<typeof validateMonsterData>[0][number];
    }

    it('accepts clean data', () => {
      expect(() =>
        validateMonsterData([
          monster({
            condition_immunities: ['Poisoned', 'Exhaustion'],
            damage_immunities: ['Poison'],
          }),
        ])
      ).not.toThrow();
    });

    it('rejects a leaked (non-condition) token in condition_immunities', () => {
      expect(() =>
        validateMonsterData([
          monster({ condition_immunities: ['Exhaustion', 'Poisoned Gear Shortbow'] }),
        ])
      ).toThrow(/invalid condition immunity "Poisoned Gear Shortbow"/);
    });

    it('rejects "Passive Perception N" in condition_immunities', () => {
      expect(() =>
        validateMonsterData([monster({ condition_immunities: ['Passive Perception 24'] })])
      ).toThrow(/invalid condition immunity/);
    });

    it('rejects condition names shifted into damage_immunities', () => {
      expect(() =>
        validateMonsterData([
          monster({ damage_immunities: ['Charmed', 'Exhaustion', 'Frightened'] }),
        ])
      ).toThrow(/damage_immunities: invalid damage entry "Charmed"/);
    });

    it('rejects gear/equipment leaked into a damage field', () => {
      expect(() =>
        validateMonsterData([monster({ damage_resistances: ['Studded Leather Armor'] })])
      ).toThrow(/invalid damage entry "Studded Leather Armor"/);
    });

    it('rejects an empty-string damage entry', () => {
      expect(() => validateMonsterData([monster({ damage_resistances: [''] })])).toThrow(
        /invalid damage entry/
      );
    });

    it('rejects legendary_actions that reference another creature', () => {
      expect(() =>
        validateMonsterData([
          monster({
            name: 'Skeleton',
            type: 'Undead',
            legendary_actions: {
              description:
                'Legendary Action Uses: 3. Immediately after another creature’s turn, the solar can expend a use to take one of the following actions.',
              actions: [{ name: 'Blinding Gaze', description: '…' }],
            },
          }),
        ])
      ).toThrow(/reference another creature/);
    });

    it('accepts a condition immunity with a parenthetical qualifier', () => {
      expect(() =>
        validateMonsterData([monster({ condition_immunities: ['Charmed (with Mind Blank)'] })])
      ).not.toThrow();
    });

    it('accepts a descriptive damage clause that starts with a damage type', () => {
      expect(() =>
        validateMonsterData([
          monster({
            damage_vulnerabilities: [
              'Piercing damage from weapons wielded by creatures under the effect of a Bless spell',
            ],
          }),
        ])
      ).not.toThrow();
    });

    it("accepts the SRD's variable Draconic Origin damage placeholder", () => {
      expect(() =>
        validateMonsterData([
          monster({
            damage_resistances: ['Damage type chosen for the Draconic Origin trait below'],
          }),
        ])
      ).not.toThrow();
    });

    it('accepts legendary_actions that reference the creature itself', () => {
      expect(() =>
        validateMonsterData([
          monster({
            name: 'Aboleth',
            type: 'Aberration',
            legendary_actions: {
              description:
                'Legendary Action Uses: 3 (4 in Lair). Immediately after another creature’s turn, the aboleth can expend a use to take one of the following actions.',
              actions: [{ name: 'Lash', description: 'The aboleth makes one Tentacle attack.' }],
            },
          }),
        ])
      ).not.toThrow();
    });

    it('reports every anomaly across all monsters in one error', () => {
      expect(() =>
        validateMonsterData([
          monster({ name: 'A', condition_immunities: ['Bogus'] }),
          monster({ name: 'B', damage_immunities: ['Charmed'] }),
        ])
      ).toThrow(/2 anomalies/);
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

  describe('loadEquipmentFromJson', () => {
    const sampleEquipmentJson = {
      equipment: [
        {
          name: 'Longsword',
          category: 'Martial Melee Weapon',
          cost: '15 GP',
          weight: 3,
          damage: '1d8',
          damage_type: 'Slashing',
          properties: ['Versatile (1d10)'],
          mastery: 'Sap',
        },
        {
          name: 'Chain Mail',
          category: 'Heavy Armor',
          cost: '75 GP',
          weight: 55,
          armor_class: '16',
          stealth_disadvantage: true,
          strength_requirement: 13,
          description: 'Heavy Armor (10 Minutes to Don and 5 Minutes to Doff).',
          properties: [],
        },
        {
          name: 'Backpack',
          category: 'Adventuring Gear',
          cost: '2 GP',
          weight: 5,
          description: 'A Backpack holds up to 30 pounds within 1 cubic foot.',
          properties: [],
        },
        {
          name: 'Explorer’s Pack',
          category: 'Equipment Pack',
          cost: '10 GP',
          weight: 55,
          description: 'An Explorer’s Pack contains the following items: Backpack.',
          properties: [],
          contents: [{ name: 'Backpack', quantity: 1 }],
        },
      ],
    };

    beforeEach(() => mockJsonFile('equipment.json', sampleEquipmentJson));

    it('maps snake_case fields to the Prisma Item shape with isMagic false', () => {
      const { items } = loadEquipmentFromJson();
      expect(items[0]).toMatchObject({
        name: 'Longsword',
        category: 'Martial Melee Weapon',
        cost: '15 GP',
        weight: 3,
        damage: '1d8',
        damageType: 'Slashing',
        isMagic: false,
      });
    });

    it('appends the weapon mastery to properties', () => {
      const { items } = loadEquipmentFromJson();
      expect(items[0].properties).toEqual(['Versatile (1d10)', 'Mastery: Sap']);
    });

    it('keeps armorClass as a self-describing string and maps armor fields', () => {
      const { items } = loadEquipmentFromJson();
      expect(items[1]).toMatchObject({
        name: 'Chain Mail',
        armorClass: '16',
        stealthDisadvantage: true,
        strengthRequirement: 13,
      });
    });

    it('defaults stealthDisadvantage to false and nullable fields to null', () => {
      const { items } = loadEquipmentFromJson();
      expect(items[2]).toMatchObject({
        stealthDisadvantage: false,
        strengthRequirement: null,
        armorClass: null,
        damage: null,
        damageType: null,
      });
    });

    it('extracts pack contents as bundles with quantities', () => {
      const { bundles } = loadEquipmentFromJson();
      expect(bundles).toEqual([
        { bundleName: 'Explorer’s Pack', components: [{ name: 'Backpack', quantity: 1 }] },
      ]);
    });

    it('throws when a pack component has a non-positive or fractional quantity', () => {
      const pack = (quantity: number) => ({
        equipment: [
          { name: 'Backpack', category: 'Adventuring Gear', cost: '2 GP', properties: [] },
          {
            name: 'Explorer’s Pack',
            category: 'Equipment Pack',
            cost: '10 GP',
            description: 'Contains things.',
            properties: [],
            contents: [{ name: 'Backpack', quantity }],
          },
        ],
      });
      for (const bad of [0, -1, 1.5]) {
        mockJsonFile('equipment.json', pack(bad));
        expect(() => loadEquipmentFromJson()).toThrow(/invalid quantity/);
      }
      mockJsonFile('equipment.json', pack(1));
      expect(() => loadEquipmentFromJson()).not.toThrow();
    });

    it('throws when a non-pack entry carries contents or a pack contains itself or another pack', () => {
      const base = [
        { name: 'Backpack', category: 'Adventuring Gear', cost: '2 GP', properties: [] },
      ];
      // contents on a non-pack
      mockJsonFile('equipment.json', {
        equipment: [
          ...base,
          {
            name: 'Rope',
            category: 'Adventuring Gear',
            cost: '1 GP',
            properties: [],
            contents: [{ name: 'Backpack', quantity: 1 }],
          },
        ],
      });
      expect(() => loadEquipmentFromJson()).toThrow(/Rope/);
      // self-containment
      mockJsonFile('equipment.json', {
        equipment: [
          {
            name: 'Explorer’s Pack',
            category: 'Equipment Pack',
            cost: '10 GP',
            description: 'Contains itself.',
            properties: [],
            contents: [{ name: 'Explorer’s Pack', quantity: 1 }],
          },
        ],
      });
      expect(() => loadEquipmentFromJson()).toThrow(/contain itself/);
      // pack-in-pack (cycles are representable; the reader resolves one level)
      mockJsonFile('equipment.json', {
        equipment: [
          {
            name: 'Burglar’s Pack',
            category: 'Equipment Pack',
            cost: '16 GP',
            description: 'Contains a pack.',
            properties: [],
            contents: [{ name: 'Explorer’s Pack', quantity: 1 }],
          },
          {
            name: 'Explorer’s Pack',
            category: 'Equipment Pack',
            cost: '10 GP',
            description: 'Contains nothing.',
            properties: [],
          },
        ],
      });
      expect(() => loadEquipmentFromJson()).toThrow(/another pack/);
    });

    it('throws on a malformed armor_class string', () => {
      mockJsonFile('equipment.json', {
        equipment: [
          {
            name: 'Odd Armor',
            category: 'Light Armor',
            cost: '5 GP',
            properties: [],
            armor_class: '1 1 + Dex modifier',
          },
        ],
      });
      expect(() => loadEquipmentFromJson()).toThrow(/armor_class/);
    });

    it('accepts every armor_class shape the SRD uses', () => {
      mockJsonFile('equipment.json', {
        equipment: ['11 + Dex modifier', '13 + Dex modifier (max 2)', '16', '+2'].map(
          (armor_class, i) => ({
            name: `Armor ${i}`,
            category: 'Light Armor',
            cost: '5 GP',
            properties: [],
            armor_class,
          })
        ),
      });
      expect(() => loadEquipmentFromJson()).not.toThrow();
    });

    it('throws when a pack component does not resolve to an equipment item', () => {
      mockJsonFile('equipment.json', {
        equipment: [
          {
            name: 'Explorer’s Pack',
            category: 'Equipment Pack',
            cost: '10 GP',
            weight: 55,
            description: 'Contains things.',
            properties: [],
            contents: [{ name: 'Nonexistent Widget', quantity: 1 }],
          },
        ],
      });
      expect(() => loadEquipmentFromJson()).toThrow(/Nonexistent Widget/);
    });

    it('throws on duplicate names within the file', () => {
      mockJsonFile('equipment.json', {
        equipment: [
          { name: 'Backpack', category: 'Adventuring Gear', cost: '2 GP', properties: [] },
          { name: 'Backpack', category: 'Adventuring Gear', cost: '2 GP', properties: [] },
        ],
      });
      expect(() => loadEquipmentFromJson()).toThrow(/Backpack/);
    });

    it('runs the free-text guard over descriptions (foreign-title bleed throws)', () => {
      mockJsonFile('equipment.json', {
        equipment: [
          { name: 'Backpack', category: 'Adventuring Gear', cost: '2 GP', properties: [] },
          {
            name: 'Bedroll',
            category: 'Adventuring Gear',
            cost: '1 GP',
            properties: [],
            description: 'A Bedroll sleeps one creature.\nBackpack',
          },
        ],
      });
      expect(() => loadEquipmentFromJson()).toThrow(/Backpack/);
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

    // ── Lineage / ancestry option tables (VEG-273) ──────────────────────────
    // The loader must surface the structured `table`/`options` the SRD prose
    // references inline ("…from the Elven Lineages table") into the flattened
    // trait description as GFM markdown, so it reaches RaceTrait.description and
    // renders on the races page instead of being dropped.
    const speciesWithOptionsJson = {
      metadata: { source: 'SRD 5.2.1', count: 3 },
      species: [
        {
          name: 'Dragonborn',
          creature_type: 'Humanoid',
          size: 'Medium',
          size_description: 'about 5-7 feet tall',
          speed: 30,
          traits: [
            {
              name: 'Draconic Ancestry',
              description: 'Choose the kind of dragon from the Draconic Ancestors table.',
              options: null,
              table: {
                name: 'Draconic Ancestors',
                columns: ['Dragon', 'Damage Type'],
                rows: [
                  ['Black', 'Acid'],
                  ['Blue', 'Lightning'],
                ],
              },
            },
          ],
        },
        {
          name: 'Goliath',
          creature_type: 'Humanoid',
          size: 'Medium',
          size_description: 'about 7-8 feet tall',
          speed: 35,
          traits: [
            {
              name: 'Giant Ancestry',
              description: 'Choose one of the following benefits:',
              options: {
                choices: [
                  {
                    name: "Cloud's Jaunt (Cloud Giant)",
                    description: 'As a Bonus Action, you teleport up to 30 feet.',
                  },
                ],
              },
              table: null,
            },
          ],
        },
        {
          name: 'Elf',
          creature_type: 'Humanoid',
          size: 'Medium',
          size_description: 'about 5-6 feet tall',
          speed: 30,
          traits: [
            {
              name: 'Elven Lineage',
              description: 'Choose a lineage from the Elven Lineages table.',
              options: { choices: [{ name: 'Drow', description: 'Your Darkvision is 120 feet.' }] },
              table: {
                name: 'Elven Lineages',
                columns: ['Lineage', 'Level 1'],
                rows: [['Drow', 'Your Darkvision is 120 feet.']],
              },
            },
          ],
        },
      ],
    };

    it('appends a referenced table to the trait description as GFM markdown', () => {
      mockJsonFile('species.json', speciesWithOptionsJson);
      const dragonborn = loadSpeciesAsRacesFromJson().find(r => r.name === 'Dragonborn')!;
      const { description } = dragonborn.traits[0];
      expect(description).toContain('Choose the kind of dragon from the Draconic Ancestors table.');
      expect(description).toContain('**Draconic Ancestors**');
      expect(description).toContain('| Dragon | Damage Type |');
      expect(description).toContain('| --- | --- |');
      expect(description).toContain('| Black | Acid |');
      expect(description).toContain('| Blue | Lightning |');
    });

    it('appends an enumerated options list as a markdown bullet list when no table is present', () => {
      mockJsonFile('species.json', speciesWithOptionsJson);
      const goliath = loadSpeciesAsRacesFromJson().find(r => r.name === 'Goliath')!;
      const { description } = goliath.traits[0];
      expect(description).toContain('Choose one of the following benefits:');
      expect(description).toContain(
        "- **Cloud's Jaunt (Cloud Giant).** As a Bonus Action, you teleport up to 30 feet."
      );
    });

    it('prefers the table over the options list when a trait carries both', () => {
      mockJsonFile('species.json', speciesWithOptionsJson);
      const elf = loadSpeciesAsRacesFromJson().find(r => r.name === 'Elf')!;
      const { description } = elf.traits[0];
      expect(description).toContain('| Lineage | Level 1 |');
      expect(description).not.toMatch(/- \*\*Drow\.\*\*/);
    });

    it('runs the species data-integrity guard, throwing on a dangling table reference', () => {
      mockJsonFile('species.json', {
        metadata: { source: 'SRD 5.2.1', count: 1 },
        species: [
          {
            name: 'Broken',
            creature_type: 'Humanoid',
            size: 'Medium',
            size_description: 'about 5 feet tall',
            speed: 30,
            traits: [
              {
                name: 'Mystery Lineage',
                description: 'Choose a lineage from the Mystery Lineages table.',
                options: null,
                table: null,
              },
            ],
          },
        ],
      });
      expect(() => loadSpeciesAsRacesFromJson()).toThrow(/species data validation failed/i);
    });
  });
});

// ── Generic free-text guards (VEG-270) ─────────────────────────────────────
// The strings below are real tails captured from the corrupt spells.json /
// magic_items.json so the tests pin the exact corruption classes the guards
// must reproduce for VEG-271 / VEG-272.
describe('generic free-text guards', () => {
  describe('trailingForeignTitle', () => {
    const siblings = new Set(['Protection from Energy', 'Arcanist’s Magic Aura', 'Light']);

    it('flags a description whose last line is another entry’s title', () => {
      // Real "Programmed Illusion" tail: the next spell name bled across the column gap.
      const text =
        'image, and any noise it makes sounds hollow to the\ncreature.\n\nProtection from Energy';
      expect(trailingForeignTitle(text, siblings)).toBe('Protection from Energy');
    });

    it('flags a foreign title appended after sentence punctuation on the final line', () => {
      const text = 'You gain Resistance to Fire, Lightning, or Thunder. Protection from Energy';
      expect(trailingForeignTitle(text, siblings)).toBe('Protection from Energy');
    });

    it('does not flag a description that ends with its own prose', () => {
      const text =
        'A shimmering green arrow streaks toward a target and bursts in a spray of acid.';
      expect(trailingForeignTitle(text, siblings)).toBeNull();
    });

    it('does not flag a single short word that merely coincides with a sibling name mid-sentence', () => {
      // "Light" is a sibling spell, but here it is ordinary prose, not a trailing title line.
      const text = 'The orb sheds Bright Light in a 20-foot radius.';
      expect(trailingForeignTitle(text, siblings)).toBeNull();
    });

    it('matches across straight/curly apostrophe variants (Arcane Sword → Arcanist’s Magic Aura)', () => {
      // The bled title carries the PDF's curly apostrophe; the spell-name set uses a straight one.
      const names = new Set(["Arcanist's Magic Aura"]);
      const text =
        'repeat the attack against the same target or\na different one.\n\nArcanist’s Magic Aura';
      // Returns the canonical title from the set (straight apostrophe), matched despite the curly variant in the text.
      expect(trailingForeignTitle(text, names)).toBe("Arcanist's Magic Aura");
    });
  });

  describe('danglingFragmentTail', () => {
    it('flags an orphaned single-letter fragment tail', () => {
      // Real "Headband of Intellect" tail — the ticket’s "… / on a / n" example.
      const text = 'Your Intelligence score is 19 while you wear this headband.\non a\nn';
      expect(danglingFragmentTail(text)).toBe('n');
    });

    it('flags an orphaned two-letter non-word fragment', () => {
      expect(danglingFragmentTail('the spell ends and the creature is freed fr')).toBe('fr');
    });

    it('does not flag a clean sentence ending', () => {
      expect(danglingFragmentTail('The target regains all expended Hit Dice.')).toBeNull();
    });

    it('does not flag a trailing "a" or "I"', () => {
      expect(danglingFragmentTail('you and a creature within 5 feet form a')).toBeNull();
      expect(danglingFragmentTail('the GM and I')).toBeNull();
    });
  });

  describe('flattenedTableSignals', () => {
    it('flags die-range token soup (e.g. Teleport / Ammunition of Slaying tables)', () => {
      const text =
        'Familiarity | Mishap | Similar Area | Off Target\nLifelong home\n01–05\n\n06–13\n\n14–24\n\n25–00\nSeen casually\n01–33\n\n34–43\n\n44–53\n\n54–00';
      expect(flattenedTableSignals(text).join(' ')).toMatch(/die-range/);
    });

    it('flags pipe-delimited table rows (e.g. Control Weather)', () => {
      const text =
        'Stage | Condition\n1 | Heat wave\n2 | Hot\n3 | Warm\n4 | Cool\n5 | Cold\n6 | Freezing';
      expect(flattenedTableSignals(text).join(' ')).toMatch(/pipe/);
    });

    it('flags wide-column alignment soup (e.g. Bag of Tricks)', () => {
      const text =
        'd8    Creature              d8    Creature\n1    Coyote                5    Black Bear\n2    Ape                   6    Giant Weasel';
      expect(flattenedTableSignals(text).join(' ')).toMatch(/wide-column/);
    });

    it('returns no signals for clean prose that mentions a single die roll', () => {
      const text =
        'When you take damage, you can take a Reaction to roll 1d12 and add your Constitution modifier, reducing the damage by that total.';
      expect(flattenedTableSignals(text)).toEqual([]);
    });

    it('does NOT flag a well-formed GFM table, even when its cells contain die ranges', () => {
      // The corrected Divine Word / Teleport tables are valid GFM; their cells hold
      // ranges like 0–20 and 01–05 that must not be mistaken for flattened soup.
      const text = [
        'You utter a word of power, as shown in the Divine Word Effects table.',
        '',
        '| Hit Points | Effect |',
        '| --- | --- |',
        '| 0–20 | The target dies. |',
        '| 21–30 | The target has the Blinded, Deafened, and Stunned conditions for 1 hour. |',
        '| 31–40 | The target has the Blinded and Deafened conditions for 10 minutes. |',
        '| 41–50 | The target has the Deafened condition for 1 minute. |',
      ].join('\n');
      expect(flattenedTableSignals(text)).toEqual([]);
    });

    it('flags a caption followed by orphan table cells (Augury-style flattened table)', () => {
      // The old Augury soup: a table reference, then bare cells on their own lines.
      const text =
        'The GM chooses the omen from the Omens table.\n\nOmens\nOmen\n\nFor Results That Will Be …\n\nWeal\n\nGood';
      expect(flattenedTableSignals(text).join(' ')).toMatch(/orphan/);
    });
  });

  describe('validateSpellData', () => {
    const spell = (over: Record<string, unknown> = {}) =>
      ({
        name: 'Test Spell',
        description: 'A clean spell description that ends properly.',
        ...over,
      }) as never;

    it('accepts clean spells', () => {
      expect(() => validateSpellData([spell(), spell({ name: 'Another' })])).not.toThrow();
    });

    it('reports foreign-title bleed between spells', () => {
      expect(() =>
        validateSpellData([
          spell({
            name: 'Programmed Illusion',
            description: 'noise it makes sounds hollow.\n\nProtection from Energy',
          }),
          spell({ name: 'Protection from Energy' }),
        ])
      ).toThrow(/Programmed Illusion.*Protection from Energy/s);
    });

    it('reports a flattened embedded table', () => {
      expect(() =>
        validateSpellData([
          spell({ description: 'Roll on the table.\n01–05\n06–13\n14–24\n25–00' }),
        ])
      ).toThrow(/flattened table/);
    });

    it('aggregates anomalies across spells into one error', () => {
      expect(() =>
        validateSpellData([
          spell({ name: 'A', description: 'cut off fragment fr' }),
          spell({ name: 'B', description: 'soup\n01–05\n06–13\n14–24' }),
        ])
      ).toThrow(/2 anomalies/);
    });

    it('accepts a spell whose table has been reconstructed as GFM markdown', () => {
      const description = [
        'The GM rolls 1d100 and consults the Teleportation Outcome table.',
        '',
        '| Familiarity | Mishap | Similar Area | Off Target | On Target |',
        '| --- | --- | --- | --- | --- |',
        '| Very familiar | 01–05 | 06–13 | 14–24 | 25–00 |',
        '| Seen casually | 01–33 | 34–43 | 44–53 | 54–00 |',
        '| False destination | 01–50 | 51–00 | — | — |',
      ].join('\n');
      expect(() => validateSpellData([spell({ name: 'Teleport', description })])).not.toThrow();
    });
  });

  describe('validateMagicItemData', () => {
    const item = (over: Record<string, unknown> = {}) =>
      ({ name: 'Test Item', description: 'A clean magic item description.', ...over }) as never;

    it('accepts clean magic items', () => {
      expect(() => validateMagicItemData([item()])).not.toThrow();
    });

    it('reports a wide-column flattened table (Bag of Tricks style)', () => {
      expect(() =>
        validateMagicItemData([
          item({
            description:
              'roll a d8.\nd8    Creature              d8    Creature\n1    Coyote                5    Black Bear\n2    Ape                   6    Giant Weasel',
          }),
        ])
      ).toThrow(/flattened table/);
    });

    it('reports a dangling fragment tail', () => {
      expect(() =>
        validateMagicItemData([item({ description: 'while you wear this headband.\non a\nn' })])
      ).toThrow(/fragment/);
    });
  });

  describe('validateSpeciesData', () => {
    const trait = (over: Record<string, unknown> = {}) => ({
      name: 'Some Trait',
      description: 'A clean trait description.',
      options: null,
      table: null,
      ...over,
    });
    const species = (name: string, traits: ReturnType<typeof trait>[]) =>
      ({ name, traits }) as never;

    it('accepts a species whose referenced table is present and well-formed', () => {
      expect(() =>
        validateSpeciesData([
          species('Dragonborn', [
            trait({
              name: 'Draconic Ancestry',
              description: 'Choose the kind of dragon from the Draconic Ancestors table.',
              table: {
                name: 'Draconic Ancestors',
                columns: ['Dragon', 'Damage Type'],
                rows: [['Black', 'Acid']],
              },
            }),
          ]),
        ])
      ).not.toThrow();
    });

    it('accepts a species whose referenced options list is enumerated', () => {
      expect(() =>
        validateSpeciesData([
          species('Goliath', [
            trait({
              name: 'Giant Ancestry',
              description: 'Choose one of the following benefits:',
              options: {
                choices: [{ name: 'Cloud’s Jaunt', description: 'You teleport 30 feet.' }],
              },
            }),
          ]),
        ])
      ).not.toThrow();
    });

    it('reports a trait that references a table that was dropped (table & options null)', () => {
      expect(() =>
        validateSpeciesData([
          species('Elf', [
            trait({
              name: 'Elven Lineage',
              description: 'Choose a lineage from the Elven Lineages table.',
              table: null,
              options: null,
            }),
          ]),
        ])
      ).toThrow(/Elven Lineage.*table/s);
    });

    it('reports free-text corruption inside a trait description', () => {
      expect(() =>
        validateSpeciesData([
          species('Orc', [
            trait({ name: 'Adrenaline Rush', description: 'You move fast on a\nn' }),
          ]),
        ])
      ).toThrow(/fragment/);
    });
  });
});
