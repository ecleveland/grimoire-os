import { foldLegacyCharacterRow } from './legacy-row';

// A sheet stored before characters held a list of classes.
const legacy = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Thorn Ironforge',
  class: 'Fighter',
  classId: 'cls-srd-fighter',
  subclass: 'Champion',
  level: 5,
  hitDice: { dieType: 'd10', total: 5, spent: 3 },
  ...over,
});

describe('foldLegacyCharacterRow', () => {
  it('folds the scalar class fields into one entry at the row level', () => {
    const folded = foldLegacyCharacterRow(legacy());

    expect(folded.classes).toEqual([
      {
        classId: 'cls-srd-fighter',
        name: 'Fighter',
        level: 5,
        subclass: 'Champion',
        subclassId: null,
      },
    ]);
    for (const key of ['class', 'classId', 'subclass']) {
      expect(folded).not.toHaveProperty(key);
    }
  });

  it('wraps a single hit-dice object in a one-pool array', () => {
    expect(foldLegacyCharacterRow(legacy()).hitDice).toEqual([
      { dieType: 'd10', total: 5, spent: 3 },
    ]);
  });

  it('keeps a null hit-dice pool null', () => {
    expect(foldLegacyCharacterRow(legacy({ hitDice: null })).hitDice).toBeNull();
  });

  it('leaves an absent hit-dice pool absent', () => {
    const { hitDice: _hitDice, ...withoutPool } = legacy();

    expect(foldLegacyCharacterRow(withoutPool)).not.toHaveProperty('hitDice');
  });

  it.each([
    ['a null class', null],
    ['an empty class', ''],
    ['an absent class', undefined],
  ])('folds %s to an empty list', (_label, value) => {
    const folded = foldLegacyCharacterRow(legacy({ class: value }));

    expect(folded.classes).toEqual([]);
    expect(folded).not.toHaveProperty('class');
    expect(folded).not.toHaveProperty('classId');
  });

  it('floors the entry level at one for a row stored at level 0', () => {
    expect(foldLegacyCharacterRow(legacy({ level: 0 })).classes).toEqual([
      expect.objectContaining({ level: 1 }),
    ]);
  });

  it('fills an absent classId and subclass with null', () => {
    const { classId: _id, subclass: _sub, ...nameOnly } = legacy();

    expect(foldLegacyCharacterRow(nameOnly).classes).toEqual([
      { classId: null, name: 'Fighter', level: 5, subclass: null, subclassId: null },
    ]);
  });

  it('passes a row already carrying classes through unchanged', () => {
    const current = {
      name: 'Thorn Ironforge',
      level: 5,
      classes: [{ classId: null, name: 'Fighter', level: 5, subclass: null, subclassId: null }],
      hitDice: [{ dieType: 'd10', total: 5, spent: 3 }],
    };

    expect(foldLegacyCharacterRow(current)).toBe(current);
  });

  it('leaves the stored data unchanged', () => {
    const stored = legacy();
    const before = structuredClone(stored);

    foldLegacyCharacterRow(stored);

    expect(stored).toEqual(before);
  });
});
