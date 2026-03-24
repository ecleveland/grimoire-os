import {
  transformSpell,
  transformMonster,
  transformEquipment,
  transformMagicItem,
  transformBackground,
  transformFeat,
} from './srd-api.transformers';

describe('SRD API Transformers', () => {
  describe('transformSpell', () => {
    it('maps API spell to Prisma shape', () => {
      const api = {
        name: 'Test Spell',
        level: 3,
        school: { name: 'Evocation' },
        casting_time: '1 action',
        range: '150 feet',
        components: ['V', 'S', 'M'],
        material: 'A tiny ball of bat guano',
        duration: 'Instantaneous',
        concentration: false,
        ritual: false,
        desc: ['Line 1.', 'Line 2.'],
        higher_level: ['When cast at 4th level, damage increases.'],
        classes: [{ name: 'Sorcerer' }, { name: 'Wizard' }],
      };

      const result = transformSpell(api);

      expect(result.name).toBe('Test Spell');
      expect(result.level).toBe(3);
      expect(result.school).toBe('Evocation');
      expect(result.components).toBe('V, S, M');
      expect(result.material).toBe('A tiny ball of bat guano');
      expect(result.description).toBe('Line 1.\n\nLine 2.');
      expect(result.higherLevels).toBe('When cast at 4th level, damage increases.');
      expect(result.classes).toEqual(['Sorcerer', 'Wizard']);
    });

    it('handles missing optional fields', () => {
      const api = {
        name: 'Simple Cantrip',
        level: 0,
        school: { name: 'Abjuration' },
        casting_time: '1 action',
        range: 'Self',
        components: ['V'],
        duration: '1 round',
        concentration: false,
        ritual: false,
        desc: ['A simple cantrip.'],
        classes: [{ name: 'Cleric' }],
      };

      const result = transformSpell(api);

      expect(result.material).toBeNull();
      expect(result.higherLevels).toBeNull();
    });
  });

  describe('transformMonster', () => {
    it('maps API monster to Prisma shape', () => {
      const api = {
        name: 'Test Beast',
        size: 'Small',
        type: 'humanoid',
        subtype: 'goblinoid',
        alignment: 'neutral evil',
        armor_class: [{ value: 15, type: 'armor' }],
        hit_points: 7,
        hit_dice: '2d6',
        speed: { walk: '30 ft.' },
        strength: 8,
        dexterity: 14,
        constitution: 10,
        intelligence: 10,
        wisdom: 8,
        charisma: 8,
        proficiencies: [
          { value: 6, proficiency: { name: 'Skill: Stealth' } },
          { value: 3, proficiency: { name: 'Saving Throw: DEX' } },
        ],
        damage_resistances: [],
        damage_immunities: ['fire'],
        damage_vulnerabilities: [],
        condition_immunities: [{ name: 'Charmed' }],
        senses: { darkvision: '60 ft.', passive_perception: 9 },
        languages: 'Common, Goblin',
        challenge_rating: 0.25,
        xp: 50,
        special_abilities: [{ name: 'Nimble Escape', desc: 'Can disengage as bonus action.' }],
        actions: [{ name: 'Scimitar', desc: 'Melee attack: +4 to hit.' }],
      };

      const result = transformMonster(api);

      expect(result.name).toBe('Test Beast');
      expect(result.armorClass).toBe(15);
      expect(result.armorType).toBe('armor');
      expect(result.hitDice).toBe('2d6');
      expect(result.speed).toBe('30 ft.');
      expect(result.savingThrows).toEqual({ DEX: 3 });
      expect(result.skills).toEqual({ Stealth: 6 });
      expect(result.damageImmunities).toEqual(['fire']);
      expect(result.conditionImmunities).toEqual(['Charmed']);
      expect(result.senses).toContain('darkvision 60 ft.');
      expect(result.specialAbilities).toHaveLength(1);
      expect(result.actions).toHaveLength(1);
      expect(result.actions![0].name).toBe('Scimitar');
    });

    it('handles speed with multiple movement types', () => {
      const api = {
        name: 'Flyer',
        size: 'Large',
        type: 'dragon',
        armor_class: [{ value: 18 }],
        hit_points: 100,
        hit_dice: '10d10',
        speed: { walk: '40 ft.', fly: '80 ft.', climb: '40 ft.' },
        strength: 20,
        dexterity: 10,
        constitution: 18,
        intelligence: 14,
        wisdom: 11,
        charisma: 19,
        proficiencies: [],
        damage_resistances: [],
        damage_immunities: [],
        damage_vulnerabilities: [],
        condition_immunities: [],
        senses: {},
        languages: 'Common, Draconic',
        challenge_rating: 10,
        xp: 5900,
      };

      const result = transformMonster(api);

      expect(result.speed).toBe('40 ft., fly 80 ft., climb 40 ft.');
    });
  });

  describe('transformEquipment', () => {
    it('maps API equipment to Prisma item shape', () => {
      const api = {
        name: 'Longsword',
        equipment_category: { name: 'Weapon' },
        category_range: 'Martial Melee',
        cost: { quantity: 15, unit: 'gp' },
        weight: 3,
        damage: { damage_dice: '1d8', damage_type: { name: 'Slashing' } },
        properties: [{ name: 'Versatile' }],
      };

      const result = transformEquipment(api);

      expect(result.name).toBe('Longsword');
      expect(result.category).toBe('Martial Melee');
      expect(result.cost).toBe('15 gp');
      expect(result.weight).toBe(3);
      expect(result.damage).toBe('1d8 slashing');
      expect(result.damageType).toBe('Slashing');
      expect(result.properties).toEqual(['Versatile']);
      expect(result.isMagic).toBe(false);
    });

    it('maps armor with stealth disadvantage', () => {
      const api = {
        name: 'Chain Mail',
        equipment_category: { name: 'Armor' },
        armor_category: 'Heavy',
        cost: { quantity: 75, unit: 'gp' },
        weight: 55,
        armor_class: { base: 16, dex_bonus: false },
        str_minimum: 13,
        stealth_disadvantage: true,
        properties: [],
      };

      const result = transformEquipment(api);

      expect(result.armorClass).toBe(16);
      expect(result.stealthDisadvantage).toBe(true);
      expect(result.strengthRequirement).toBe(13);
    });
  });

  describe('transformMagicItem', () => {
    it('maps API magic item to Prisma shape', () => {
      const api = {
        name: 'Bag of Holding',
        equipment_category: { name: 'Wondrous Items' },
        rarity: { name: 'Uncommon' },
        desc: ['A magical bag.', 'It holds many things.'],
      };

      const result = transformMagicItem(api);

      expect(result.name).toBe('Bag of Holding');
      expect(result.category).toBe('Wondrous Items');
      expect(result.rarity).toBe('Uncommon');
      expect(result.isMagic).toBe(true);
      expect(result.description).toBe('A magical bag.\n\nIt holds many things.');
      expect(result.requiresAttunement).toBe(false);
    });

    it('detects attunement requirement from description', () => {
      const api = {
        name: 'Cloak of Protection',
        equipment_category: { name: 'Wondrous Items' },
        rarity: { name: 'Uncommon' },
        desc: ['Wondrous item, uncommon (requires attunement)', 'You gain a +1 bonus to AC.'],
      };

      const result = transformMagicItem(api);

      expect(result.requiresAttunement).toBe(true);
    });
  });

  describe('transformBackground', () => {
    it('maps API background to Prisma shape', () => {
      const api = {
        name: 'Acolyte',
        starting_proficiencies: [{ name: 'Skill: Insight' }, { name: 'Skill: Religion' }],
        language_options: { choose: 2 },
        starting_equipment: [
          { equipment: { name: 'Clothes, common' }, quantity: 1 },
          { equipment: { name: 'Pouch' }, quantity: 1 },
        ],
        feature: {
          name: 'Shelter of the Faithful',
          desc: ['You command respect.'],
        },
        personality_traits: {
          from: { options: [{ string: 'I am kind.', option_type: 'string' }] },
        },
        ideals: {
          from: {
            options: [{ desc: 'Charity is important.', option_type: 'ideal' }],
          },
        },
        bonds: {
          from: {
            options: [{ string: 'I serve my temple.', option_type: 'string' }],
          },
        },
        flaws: {
          from: {
            options: [{ string: 'I am inflexible.', option_type: 'string' }],
          },
        },
      };

      const result = transformBackground(api);

      expect(result.name).toBe('Acolyte');
      expect(result.skillProficiencies).toEqual(['Insight', 'Religion']);
      expect(result.languages).toBe(2);
      expect(result.equipment).toContain('Clothes, common');
      expect(result.feature!.name).toBe('Shelter of the Faithful');
      expect(result.personalityTraits).toEqual(['I am kind.']);
      expect(result.ideals).toEqual(['Charity is important.']);
      expect(result.bonds).toEqual(['I serve my temple.']);
      expect(result.flaws).toEqual(['I am inflexible.']);
    });
  });

  describe('transformFeat', () => {
    it('maps API feat to Prisma shape', () => {
      const api = {
        name: 'Grappler',
        desc: ['You have advantage on attack rolls.', 'You can restrain a creature.'],
        prerequisites: [
          {
            ability_score: { name: 'STR' },
            minimum_score: 13,
            type: 'ability_score',
          },
        ],
      };

      const result = transformFeat(api);

      expect(result.name).toBe('Grappler');
      expect(result.description).toBe(
        'You have advantage on attack rolls.\n\nYou can restrain a creature.'
      );
      expect(result.prerequisite).toBe('STR 13 or higher');
      expect(result.benefits).toEqual(['You can restrain a creature.']);
    });

    it('handles feats without prerequisites', () => {
      const api = {
        name: 'Alert',
        desc: ['You are always on guard.'],
        prerequisites: [],
      };

      const result = transformFeat(api);

      expect(result.prerequisite).toBeNull();
    });
  });
});
