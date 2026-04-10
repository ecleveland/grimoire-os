import { srdClasses } from './classes';

const FULL_CASTERS = ['Bard', 'Cleric', 'Druid', 'Sorcerer', 'Wizard'];
const HALF_CASTERS = ['Paladin', 'Ranger'];
const PACT_CASTER = 'Warlock';
const NON_CASTERS = ['Barbarian', 'Fighter', 'Monk', 'Rogue'];

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
