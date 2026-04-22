import { srdClasses } from './classes';

const ALL_CLASSES = [
  'Barbarian', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Monk',
  'Paladin', 'Ranger', 'Rogue', 'Sorcerer', 'Warlock', 'Wizard',
];
const FULL_CASTERS = ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard'];
const HALF_CASTERS = ['Paladin', 'Ranger'];
const PACT_CASTER = 'Warlock';
const NON_CASTERS = ['Barbarian', 'Fighter', 'Monk', 'Rogue'];

const CANTRIP_CASTERS = ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Warlock', 'Wizard'];
const NO_CANTRIP_CASTERS = ['Paladin', 'Ranger'];
const SPELLS_KNOWN_CLASSES = ['Bard', 'Ranger', 'Sorcerer', 'Warlock'];
const PREPARED_CLASSES = ['Cleric', 'Druid', 'Paladin', 'Wizard'];

function getClass(name: string) {
  const cls = srdClasses.find(c => c.name === name);
  if (!cls) throw new Error(`Class "${name}" not found in seed data`);
  return cls;
}

describe('SRD class seed data — spell slot progression', () => {
  describe('full casters', () => {
    it.each(FULL_CASTERS)('%s should have spellSlotProgression for levels 1–20', name => {
      const cls = getClass(name);
      const prog = cls.spellcasting?.spellSlotProgression;
      expect(prog).toBeDefined();

      for (let level = 1; level <= 20; level++) {
        expect(prog![level]).toBeDefined();
        expect(Object.keys(prog![level]).length).toBeGreaterThan(0);
      }
    });

    it.each(FULL_CASTERS)('%s should have 9th-level slots at character level 17+', name => {
      const prog = getClass(name).spellcasting!.spellSlotProgression!;
      for (let level = 17; level <= 20; level++) {
        expect(prog[level][9]).toBeGreaterThanOrEqual(1);
      }
    });

    it.each(FULL_CASTERS)('%s should start with 2 first-level slots at character level 1', name => {
      const prog = getClass(name).spellcasting!.spellSlotProgression!;
      expect(prog[1][1]).toBe(2);
    });

    it('all full casters should share the same progression table', () => {
      const tables = FULL_CASTERS.map(name => getClass(name).spellcasting!.spellSlotProgression);
      for (let i = 1; i < tables.length; i++) {
        expect(tables[i]).toEqual(tables[0]);
      }
    });
  });

  describe('half casters', () => {
    it.each(HALF_CASTERS)('%s should have spellSlotProgression for levels 1–20', name => {
      const cls = getClass(name);
      const prog = cls.spellcasting?.spellSlotProgression;
      expect(prog).toBeDefined();

      for (let level = 1; level <= 20; level++) {
        expect(prog![level]).toBeDefined();
      }
    });

    it.each(HALF_CASTERS)('%s should have no spell slots at level 1', name => {
      const prog = getClass(name).spellcasting!.spellSlotProgression!;
      expect(Object.keys(prog[1]).length).toBe(0);
    });

    it.each(HALF_CASTERS)('%s should start gaining slots at level 2', name => {
      const prog = getClass(name).spellcasting!.spellSlotProgression!;
      expect(prog[2][1]).toBe(2);
    });

    it.each(HALF_CASTERS)('%s should max at 5th-level slots (no 6th+)', name => {
      const prog = getClass(name).spellcasting!.spellSlotProgression!;
      for (let level = 1; level <= 20; level++) {
        for (const slotLevel of Object.keys(prog[level])) {
          expect(Number(slotLevel)).toBeLessThanOrEqual(5);
        }
      }
    });
  });

  describe('Warlock (Pact Magic)', () => {
    it('should have pactMagic flag set to true', () => {
      const warlock = getClass(PACT_CASTER);
      expect(warlock.spellcasting?.pactMagic).toBe(true);
    });

    it('should have pactSlotProgression for levels 1–20', () => {
      const prog = getClass(PACT_CASTER).spellcasting?.pactSlotProgression;
      expect(prog).toBeDefined();

      for (let level = 1; level <= 20; level++) {
        expect(prog![level]).toBeDefined();
        expect(prog![level].slots).toBeGreaterThanOrEqual(1);
        expect(prog![level].slotLevel).toBeGreaterThanOrEqual(1);
      }
    });

    it('should not have standard spellSlotProgression', () => {
      const warlock = getClass(PACT_CASTER);
      expect(warlock.spellcasting?.spellSlotProgression).toBeUndefined();
    });

    it('should cap at slot level 5', () => {
      const prog = getClass(PACT_CASTER).spellcasting!.pactSlotProgression!;
      for (let level = 1; level <= 20; level++) {
        expect(prog[level].slotLevel).toBeLessThanOrEqual(5);
      }
    });

    it('should have 4 slots at level 17+', () => {
      const prog = getClass(PACT_CASTER).spellcasting!.pactSlotProgression!;
      for (let level = 17; level <= 20; level++) {
        expect(prog[level].slots).toBe(4);
      }
    });
  });

  describe('non-casters', () => {
    it.each(NON_CASTERS)('%s should not have spellcasting', name => {
      const cls = getClass(name);
      expect(cls.spellcasting).toBeUndefined();
    });
  });

  describe('data integrity', () => {
    it('all casting classes should preserve their ability field', () => {
      const expected: Record<string, string> = {
        Bard: 'Charisma',
        Cleric: 'Wisdom',
        Druid: 'Wisdom',
        Paladin: 'Charisma',
        Ranger: 'Wisdom',
        Sorcerer: 'Charisma',
        Warlock: 'Charisma',
        Wizard: 'Intelligence',
      };

      for (const [name, ability] of Object.entries(expected)) {
        expect(getClass(name).spellcasting?.ability).toBe(ability);
      }
    });

    it('spell slot counts should be positive integers', () => {
      const allCasters = [...FULL_CASTERS, ...HALF_CASTERS];
      for (const name of allCasters) {
        const prog = getClass(name).spellcasting!.spellSlotProgression!;
        for (let level = 1; level <= 20; level++) {
          for (const count of Object.values(prog[level])) {
            expect(Number.isInteger(count)).toBe(true);
            expect(count).toBeGreaterThan(0);
          }
        }
      }
    });

    it('slot counts should never decrease as character level increases', () => {
      const allCasters = [...FULL_CASTERS, ...HALF_CASTERS];
      for (const name of allCasters) {
        const prog = getClass(name).spellcasting!.spellSlotProgression!;
        for (let level = 2; level <= 20; level++) {
          for (const [slotLevel, count] of Object.entries(prog[level])) {
            const prevCount = prog[level - 1][Number(slotLevel)] ?? 0;
            expect(count).toBeGreaterThanOrEqual(prevCount);
          }
        }
      }
    });
  });
});

describe('SRD class seed data — cantrips known progression', () => {
  describe('cantrip casters', () => {
    it.each(CANTRIP_CASTERS)('%s should have cantripsKnown for levels 1–20', name => {
      const prog = getClass(name).spellcasting?.cantripsKnown;
      expect(prog).toBeDefined();

      for (let level = 1; level <= 20; level++) {
        expect(prog![level]).toBeDefined();
        expect(prog![level]).toBeGreaterThan(0);
      }
    });

    it.each(CANTRIP_CASTERS)('%s cantrip count should never decrease', name => {
      const prog = getClass(name).spellcasting!.cantripsKnown!;
      for (let level = 2; level <= 20; level++) {
        expect(prog[level]).toBeGreaterThanOrEqual(prog[level - 1]);
      }
    });

    it.each(CANTRIP_CASTERS)('%s cantrip counts should be positive integers', name => {
      const prog = getClass(name).spellcasting!.cantripsKnown!;
      for (let level = 1; level <= 20; level++) {
        expect(Number.isInteger(prog[level])).toBe(true);
        expect(prog[level]).toBeGreaterThan(0);
      }
    });
  });

  describe('no-cantrip casters', () => {
    it.each(NO_CANTRIP_CASTERS)('%s should not have cantripsKnown', name => {
      expect(getClass(name).spellcasting?.cantripsKnown).toBeUndefined();
    });
  });

  describe('non-casters', () => {
    it.each(NON_CASTERS)('%s should not have cantripsKnown', name => {
      expect(getClass(name).spellcasting?.cantripsKnown).toBeUndefined();
    });
  });
});

describe('SRD class seed data — spells known / prepared formula', () => {
  describe('spells known classes', () => {
    it.each(SPELLS_KNOWN_CLASSES)('%s should have spellsKnown for levels 1–20', name => {
      const prog = getClass(name).spellcasting?.spellsKnown;
      expect(prog).toBeDefined();

      for (let level = 1; level <= 20; level++) {
        expect(prog![level]).toBeDefined();
        expect(Number.isInteger(prog![level])).toBe(true);
      }
    });

    it.each(SPELLS_KNOWN_CLASSES)('%s spells known should never decrease', name => {
      const prog = getClass(name).spellcasting!.spellsKnown!;
      for (let level = 2; level <= 20; level++) {
        expect(prog[level]).toBeGreaterThanOrEqual(prog[level - 1]);
      }
    });

    it.each(SPELLS_KNOWN_CLASSES)('%s should NOT have preparedFormula', name => {
      expect(getClass(name).spellcasting?.preparedFormula).toBeUndefined();
    });

    it('Ranger should have 0 spells known at level 1', () => {
      expect(getClass('Ranger').spellcasting!.spellsKnown![1]).toBe(0);
    });

    it('Ranger should start knowing spells at level 2', () => {
      expect(getClass('Ranger').spellcasting!.spellsKnown![2]).toBeGreaterThan(0);
    });
  });

  describe('prepared casters', () => {
    it.each(PREPARED_CLASSES)('%s should have preparedFormula', name => {
      const formula = getClass(name).spellcasting?.preparedFormula;
      expect(formula).toBeDefined();
      expect(typeof formula).toBe('string');
      expect(formula!.length).toBeGreaterThan(0);
    });

    it.each(PREPARED_CLASSES)('%s should NOT have spellsKnown', name => {
      expect(getClass(name).spellcasting?.spellsKnown).toBeUndefined();
    });
  });

  describe('non-casters', () => {
    it.each(NON_CASTERS)('%s should not have spellsKnown or preparedFormula', name => {
      const cls = getClass(name);
      expect(cls.spellcasting?.spellsKnown).toBeUndefined();
      expect(cls.spellcasting?.preparedFormula).toBeUndefined();
    });
  });
});

describe('SRD class seed data — starting equipment', () => {
  describe('all classes have equipment defined', () => {
    it.each(ALL_CLASSES)('%s should have equipmentChoices defined', name => {
      const cls = getClass(name);
      expect(cls.equipmentChoices).toBeDefined();
    });

    it.each(ALL_CLASSES)('%s should have at least one choice', name => {
      const eq = getClass(name).equipmentChoices!;
      expect(eq.choices.length).toBeGreaterThanOrEqual(1);
    });

    it.each(ALL_CLASSES)('%s should have startingGold as a non-empty string', name => {
      const eq = getClass(name).equipmentChoices!;
      expect(typeof eq.startingGold).toBe('string');
      expect(eq.startingGold!.length).toBeGreaterThan(0);
    });
  });

  describe('choice structure validity', () => {
    it.each(ALL_CLASSES)('%s choices should have valid structure', name => {
      const eq = getClass(name).equipmentChoices!;
      for (const choice of eq.choices) {
        expect(choice.choose).toBeGreaterThanOrEqual(1);
        expect(choice.from.length).toBeGreaterThan(0);
        for (const option of choice.from) {
          expect(option.items.length).toBeGreaterThan(0);
        }
      }
    });

    it.each(ALL_CLASSES)('%s items should have valid name and quantity', name => {
      const eq = getClass(name).equipmentChoices!;
      const allItems = [
        ...eq.choices.flatMap(c => c.from.flatMap(o => o.items)),
        ...(eq.guaranteed ?? []),
      ];
      for (const item of allItems) {
        expect(typeof item.name).toBe('string');
        expect(item.name.length).toBeGreaterThan(0);
        expect(Number.isInteger(item.quantity)).toBe(true);
        expect(item.quantity).toBeGreaterThan(0);
      }
    });
  });

  describe('spot checks', () => {
    it('Fighter should have startingGold of "5d4 x 10 gp"', () => {
      expect(getClass('Fighter').equipmentChoices!.startingGold).toBe('5d4 x 10 gp');
    });

    it('Wizard guaranteed items should include Spellbook', () => {
      const guaranteed = getClass('Wizard').equipmentChoices!.guaranteed!;
      expect(guaranteed.some(i => i.name === 'Spellbook')).toBe(true);
    });

    it('Barbarian first choice should offer Greataxe', () => {
      const firstChoice = getClass('Barbarian').equipmentChoices!.choices[0];
      const allItemNames = firstChoice.from.flatMap(o => o.items.map(i => i.name));
      expect(allItemNames).toContain('Greataxe');
    });

    it('Monk should have startingGold of "5d4 gp"', () => {
      expect(getClass('Monk').equipmentChoices!.startingGold).toBe('5d4 gp');
    });

    it('Rogue guaranteed items should include Thieves\' tools', () => {
      const guaranteed = getClass('Rogue').equipmentChoices!.guaranteed!;
      expect(guaranteed.some(i => i.name === "Thieves' tools")).toBe(true);
    });
  });
});
