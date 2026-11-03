import { describe, expect, it } from 'vitest';
import {
  classesSumToLevel,
  duplicateClassEntry,
  firstClassName,
  firstPool,
  hitDicePoolsFor,
  hitDiceSpent,
  hitDiceTotal,
  projectClassScalars,
  type CharacterClass,
  type HitDice,
} from '@grimoire-os/shared';

function cls(name: string, level: number, overrides: Partial<CharacterClass> = {}): CharacterClass {
  return { classId: null, name, level, subclass: null, subclassId: null, ...overrides };
}

const d10: HitDice = { dieType: 'd10', total: 5, spent: 2 };
const d8: HitDice = { dieType: 'd8', total: 3, spent: 1 };

describe('firstPool', () => {
  it('returns null for null', () => {
    expect(firstPool(null)).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(firstPool([])).toBeNull();
  });

  it('returns the first pool when there are several', () => {
    expect(firstPool([d10, d8])).toBe(d10);
  });
});

describe('hitDiceTotal and hitDiceSpent', () => {
  it('sum every pool', () => {
    expect(hitDiceTotal([d10, d8])).toBe(8);
    expect(hitDiceSpent([d10, d8])).toBe(3);
  });

  it('count null and undefined as zero', () => {
    expect(hitDiceTotal(null)).toBe(0);
    expect(hitDiceSpent(undefined)).toBe(0);
  });
});

describe('hitDicePoolsFor', () => {
  it('gives a single class one pool of its die, one per level', () => {
    expect(hitDicePoolsFor([{ hitDie: 'd10', level: 5 }], null)).toEqual([
      { dieType: 'd10', total: 5, spent: 0 },
    ]);
  });

  it('merges two classes with the same die into one pool', () => {
    const pools = hitDicePoolsFor(
      [
        { hitDie: 'd10', level: 3 },
        { hitDie: 'd10', level: 2 },
      ],
      null
    );
    expect(pools).toEqual([{ dieType: 'd10', total: 5, spent: 0 }]);
  });

  it('keeps two dice as two pools in the order the classes name them', () => {
    const pools = hitDicePoolsFor(
      [
        { hitDie: 'd8', level: 3 },
        { hitDie: 'd10', level: 2 },
      ],
      null
    );
    expect(pools).toEqual([
      { dieType: 'd8', total: 3, spent: 0 },
      { dieType: 'd10', total: 2, spent: 0 },
    ]);
  });

  it('carries spent dice from the stored pool of the same die', () => {
    const pools = hitDicePoolsFor(
      [{ hitDie: 'd10', level: 5 }],
      [{ dieType: 'd10', total: 4, spent: 3 }]
    );
    expect(pools).toEqual([{ dieType: 'd10', total: 5, spent: 3 }]);
  });

  it('clamps carried spent dice to the new total', () => {
    const pools = hitDicePoolsFor(
      [{ hitDie: 'd10', level: 5 }],
      [{ dieType: 'd10', total: 8, spent: 7 }]
    );
    expect(pools).toEqual([{ dieType: 'd10', total: 5, spent: 5 }]);
  });

  it('appends a carried pool whose die no class produces, unchanged', () => {
    const granted: HitDice = { dieType: 'd12', total: 2, spent: 1 };
    const pools = hitDicePoolsFor([{ hitDie: 'd10', level: 5 }], [granted]);
    expect(pools).toEqual([{ dieType: 'd10', total: 5, spent: 0 }, granted]);
  });

  it('ignores a class whose die is not a hit die', () => {
    expect(hitDicePoolsFor([{ hitDie: 'd100', level: 4 }], null)).toEqual([]);
  });

  it('floors a zero-level class at one die', () => {
    expect(hitDicePoolsFor([{ hitDie: 'd6', level: 0 }], null)).toEqual([
      { dieType: 'd6', total: 1, spent: 0 },
    ]);
  });
});

describe('classesSumToLevel', () => {
  it('accepts an empty class list at any level', () => {
    expect(classesSumToLevel([], 7)).toBe(true);
  });

  it('accepts levels that sum to the character level', () => {
    expect(classesSumToLevel([cls('Fighter', 3), cls('Paladin', 2)], 5)).toBe(true);
  });

  it('rejects levels that do not sum to the character level', () => {
    expect(classesSumToLevel([cls('Fighter', 3), cls('Paladin', 2)], 6)).toBe(false);
  });
});

describe('duplicateClassEntry', () => {
  it('names a class repeated with different case and spacing', () => {
    expect(duplicateClassEntry([cls('Fighter', 1), cls('  fighter ', 1)])).toBe('  fighter ');
  });

  it('flags two entries with the same classId', () => {
    expect(
      duplicateClassEntry([
        cls('Fighter', 1, { classId: 'c1' }),
        cls('Brawler', 1, { classId: 'c1' }),
      ])
    ).not.toBeNull();
  });

  it('returns null when every entry is distinct', () => {
    expect(duplicateClassEntry([cls('Fighter', 1), cls('Wizard', 1)])).toBeNull();
  });

  it('does not treat two null classIds as a repeat', () => {
    expect(duplicateClassEntry([cls('Fighter', 1), cls('Witch', 1)])).toBeNull();
  });
});

describe('firstClassName', () => {
  it('returns the name of the first class, or null', () => {
    expect(firstClassName([cls('Rogue', 2), cls('Wizard', 1)])).toBe('Rogue');
    expect(firstClassName([])).toBeNull();
    expect(firstClassName(null)).toBeNull();
  });
});

describe('projectClassScalars', () => {
  it('returns all nulls for no classes', () => {
    expect(projectClassScalars([])).toEqual({
      class: null,
      classId: null,
      subclass: null,
      subclassId: null,
    });
  });

  it('projects the first class onto the old scalar fields', () => {
    const classes = [
      cls('Fighter', 3, { classId: 'c1', subclass: 'Champion', subclassId: 's1' }),
      cls('Wizard', 2, { classId: 'c2', subclass: 'Evoker' }),
    ];
    expect(projectClassScalars(classes)).toEqual({
      class: 'Fighter',
      classId: 'c1',
      subclass: 'Champion',
      subclassId: 's1',
    });
  });
});
