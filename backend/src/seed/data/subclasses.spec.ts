import { srdSubclasses } from './subclasses';

const THIRD_CASTER_SUBCLASSES = ['Eldritch Knight', 'Arcane Trickster'];
const NON_CASTER_SUBCLASSES = [
  'Path of the Berserker',
  'College of Lore',
  'Life Domain',
  'Circle of the Land',
  'Champion',
  'Way of the Open Hand',
  'Oath of Devotion',
  'Hunter',
  'Thief',
  'Draconic Bloodline',
  'The Fiend',
  'School of Evocation',
];

function getSubclass(name: string) {
  const sc = srdSubclasses.find(s => s.name === name);
  if (!sc) throw new Error(`Subclass "${name}" not found in seed data`);
  return sc;
}

describe('SRD subclass seed data — 1/3-caster spell slot progression', () => {
  it.each(THIRD_CASTER_SUBCLASSES)('%s should have spellSlotProgression for levels 1–20', name => {
    const prog = getSubclass(name).spellcasting?.spellSlotProgression;
    expect(prog).toBeDefined();

    for (let level = 1; level <= 20; level++) {
      expect(prog![level]).toBeDefined();
    }
  });

  it.each(THIRD_CASTER_SUBCLASSES)('%s should have no spell slots at levels 1–2', name => {
    const prog = getSubclass(name).spellcasting!.spellSlotProgression!;
    expect(Object.keys(prog[1]).length).toBe(0);
    expect(Object.keys(prog[2]).length).toBe(0);
  });

  it.each(THIRD_CASTER_SUBCLASSES)(
    '%s should start gaining slots at level 3 with 2 first-level slots',
    name => {
      const prog = getSubclass(name).spellcasting!.spellSlotProgression!;
      expect(prog[3][1]).toBe(2);
    }
  );

  it.each(THIRD_CASTER_SUBCLASSES)('%s should max at 4th-level slots (no 5th+)', name => {
    const prog = getSubclass(name).spellcasting!.spellSlotProgression!;
    for (let level = 1; level <= 20; level++) {
      for (const slotLevel of Object.keys(prog[level])) {
        expect(Number(slotLevel)).toBeLessThanOrEqual(4);
      }
    }
  });

  it.each(THIRD_CASTER_SUBCLASSES)(
    '%s slot counts should never decrease as character level increases',
    name => {
      const prog = getSubclass(name).spellcasting!.spellSlotProgression!;
      for (let level = 2; level <= 20; level++) {
        for (const [slotLevel, count] of Object.entries(prog[level])) {
          const prevCount = prog[level - 1][Number(slotLevel)] ?? 0;
          expect(count).toBeGreaterThanOrEqual(prevCount);
        }
      }
    }
  );

  it('both 1/3 casters should share the same slot progression table', () => {
    const tables = THIRD_CASTER_SUBCLASSES.map(
      name => getSubclass(name).spellcasting!.spellSlotProgression
    );
    expect(tables[0]).toEqual(tables[1]);
  });

  it('slot counts should be positive integers', () => {
    for (const name of THIRD_CASTER_SUBCLASSES) {
      const prog = getSubclass(name).spellcasting!.spellSlotProgression!;
      for (let level = 1; level <= 20; level++) {
        for (const count of Object.values(prog[level])) {
          expect(Number.isInteger(count)).toBe(true);
          expect(count).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('SRD subclass seed data — cantrips known progression', () => {
  it.each(THIRD_CASTER_SUBCLASSES)('%s should have cantripsKnown for levels 1–20', name => {
    const prog = getSubclass(name).spellcasting?.cantripsKnown;
    expect(prog).toBeDefined();

    for (let level = 1; level <= 20; level++) {
      expect(prog![level]).toBeDefined();
      expect(Number.isInteger(prog![level])).toBe(true);
    }
  });

  it.each(THIRD_CASTER_SUBCLASSES)('%s should have 0 cantrips at levels 1–2', name => {
    const prog = getSubclass(name).spellcasting!.cantripsKnown!;
    expect(prog[1]).toBe(0);
    expect(prog[2]).toBe(0);
  });

  it.each(THIRD_CASTER_SUBCLASSES)('%s cantrip count should never decrease', name => {
    const prog = getSubclass(name).spellcasting!.cantripsKnown!;
    for (let level = 2; level <= 20; level++) {
      expect(prog[level]).toBeGreaterThanOrEqual(prog[level - 1]);
    }
  });

  it('Eldritch Knight should have 2 cantrips at L3 and 3 at L10', () => {
    const prog = getSubclass('Eldritch Knight').spellcasting!.cantripsKnown!;
    expect(prog[3]).toBe(2);
    expect(prog[10]).toBe(3);
  });

  it('Arcane Trickster should have 3 cantrips at L3 and 4 at L10', () => {
    const prog = getSubclass('Arcane Trickster').spellcasting!.cantripsKnown!;
    expect(prog[3]).toBe(3);
    expect(prog[10]).toBe(4);
  });
});

describe('SRD subclass seed data — spells known progression', () => {
  it.each(THIRD_CASTER_SUBCLASSES)('%s should have spellsKnown for levels 1–20', name => {
    const prog = getSubclass(name).spellcasting?.spellsKnown;
    expect(prog).toBeDefined();

    for (let level = 1; level <= 20; level++) {
      expect(prog![level]).toBeDefined();
      expect(Number.isInteger(prog![level])).toBe(true);
    }
  });

  it.each(THIRD_CASTER_SUBCLASSES)('%s should have 0 spells known at levels 1–2', name => {
    const prog = getSubclass(name).spellcasting!.spellsKnown!;
    expect(prog[1]).toBe(0);
    expect(prog[2]).toBe(0);
  });

  it.each(THIRD_CASTER_SUBCLASSES)('%s should know 3 spells at level 3', name => {
    const prog = getSubclass(name).spellcasting!.spellsKnown!;
    expect(prog[3]).toBe(3);
  });

  it.each(THIRD_CASTER_SUBCLASSES)('%s spells known should never decrease', name => {
    const prog = getSubclass(name).spellcasting!.spellsKnown!;
    for (let level = 2; level <= 20; level++) {
      expect(prog[level]).toBeGreaterThanOrEqual(prog[level - 1]);
    }
  });

  it('both 1/3 casters should share the same spells known progression', () => {
    const tables = THIRD_CASTER_SUBCLASSES.map(name => getSubclass(name).spellcasting!.spellsKnown);
    expect(tables[0]).toEqual(tables[1]);
  });
});

describe('SRD subclass seed data — spellcasting ability', () => {
  it.each(THIRD_CASTER_SUBCLASSES)('%s should use Intelligence', name => {
    expect(getSubclass(name).spellcasting?.ability).toBe('Intelligence');
  });
});

describe('SRD subclass seed data — non-caster subclasses', () => {
  it.each(NON_CASTER_SUBCLASSES)('%s should not have spellcasting', name => {
    const sc = getSubclass(name);
    expect(sc.spellcasting).toBeUndefined();
  });
});
