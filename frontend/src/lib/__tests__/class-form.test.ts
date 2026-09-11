import { describe, it, expect } from 'vitest';
import {
  classToFormState,
  emptyClassFormState,
  formStateToPayload,
  type ClassFormState,
} from '@/lib/class-form';
import type { ClassFeatureDraft } from '@/components/ClassFeaturesEditor';
import { DEFAULT_HIT_DIE, type SrdClass } from '@/lib/types';

function makeClass(over: Partial<SrdClass> = {}): SrdClass {
  return {
    id: 'cls-hb',
    name: 'Warden',
    hitDie: 'd10',
    description: 'A sworn protector of wild places.',
    primaryAbilities: ['Strength', 'Wisdom'],
    savingThrows: ['Strength', 'Constitution'],
    skillChoices: ['Athletics', 'Nature', 'Survival'],
    numSkillChoices: 2,
    armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
    weaponProficiencies: ['Simple weapons', 'Martial weapons'],
    toolProficiencies: ['Herbalism Kit'],
    subclassLevel: 3,
    features: [
      { id: 'cf-1', name: 'Wardens Bond', level: 1, description: 'A bond.' },
      { id: 'cf-2', name: 'Grove Step', level: 4 },
    ],
    multiclassing: {
      prerequisites: [{ ability: 'Wisdom', minimum: 13 }],
      proficienciesGained: ['Shields'],
      casterType: null,
    },
    source: 'Homebrew',
    contentSource: 'homebrew',
    createdById: 'u1',
    ...over,
  };
}

function makeState(over: Partial<ClassFormState> = {}): ClassFormState {
  return { ...emptyClassFormState(), name: 'Warden', ...over };
}

/** The payload for a state expected to validate; fails the test with the error otherwise. */
function payloadOf(state: ClassFormState) {
  const result = formStateToPayload(state);
  if ('error' in result) throw new Error(`expected a payload, got: ${result.error}`);
  return result.payload;
}

describe('emptyClassFormState', () => {
  it('starts on the default hit die with a zero skill count and every other field empty', () => {
    expect(emptyClassFormState()).toEqual({
      name: '',
      hitDie: DEFAULT_HIT_DIE,
      description: '',
      primaryAbilities: [],
      savingThrows: [],
      skillChoices: [],
      numSkillChoices: '0',
      armorProficiencies: [],
      weaponProficiencies: [],
      toolProficiencies: [],
      subclassLevel: '',
      features: [],
    });
  });
});

describe('classToFormState', () => {
  it('maps every field and drops the API id from each feature row (VEG-508)', () => {
    expect(classToFormState(makeClass())).toEqual({
      name: 'Warden',
      hitDie: 'd10',
      description: 'A sworn protector of wild places.',
      primaryAbilities: ['Strength', 'Wisdom'],
      savingThrows: ['Strength', 'Constitution'],
      skillChoices: ['Athletics', 'Nature', 'Survival'],
      numSkillChoices: '2',
      armorProficiencies: ['Light armor', 'Medium armor', 'Shields'],
      weaponProficiencies: ['Simple weapons', 'Martial weapons'],
      toolProficiencies: ['Herbalism Kit'],
      subclassLevel: '3',
      // No `id` on either row, and the missing description becomes a blank box.
      features: [
        { name: 'Wardens Bond', level: 1, description: 'A bond.' },
        { name: 'Grove Step', level: 4, description: '' },
      ],
    });
  });

  it('maps a null or missing subclass level to a blank box', () => {
    expect(classToFormState(makeClass({ subclassLevel: undefined })).subclassLevel).toBe('');
    // The API sends null for a class without one, which the shared type doesn't model.
    const withNull = makeClass({ subclassLevel: null as unknown as number });
    expect(classToFormState(withNull).subclassLevel).toBe('');
  });
});

describe('formStateToPayload', () => {
  it('builds the full payload from a valid state (VEG-508)', () => {
    const result = formStateToPayload(
      makeState({
        name: ' Warden ',
        hitDie: 'd10',
        description: ' A sworn protector. ',
        primaryAbilities: ['Strength'],
        savingThrows: ['Strength', 'Constitution'],
        skillChoices: ['Athletics', 'Survival'],
        numSkillChoices: '2',
        armorProficiencies: ['Light armor', 'Shields'],
        weaponProficiencies: ['Simple weapons'],
        toolProficiencies: ['Herbalism Kit'],
        subclassLevel: '3',
        features: [{ name: 'Wardens Bond', level: 1, description: 'A bond.' }],
      })
    );

    expect(result).toEqual({
      payload: {
        name: 'Warden',
        hitDie: 'd10',
        description: 'A sworn protector.',
        primaryAbilities: ['Strength'],
        savingThrows: ['Strength', 'Constitution'],
        skillChoices: ['Athletics', 'Survival'],
        numSkillChoices: 2,
        armorProficiencies: ['Light armor', 'Shields'],
        weaponProficiencies: ['Simple weapons'],
        toolProficiencies: ['Herbalism Kit'],
        subclassLevel: 3,
        features: [{ name: 'Wardens Bond', level: 1, description: 'A bond.' }],
      },
    });
  });

  it('serializes a blank description and a blank subclass level as null', () => {
    const payload = payloadOf(makeState({ description: '   ', subclassLevel: '  ' }));

    expect(payload.description).toBeNull();
    expect(payload.subclassLevel).toBeNull();
  });

  it('reads a blank skill count as 0 when no skills are offered', () => {
    expect(payloadOf(makeState({ numSkillChoices: '' })).numSkillChoices).toBe(0);
  });

  it('runs all six lists through cleanList, dropping blanks and duplicates', () => {
    const payload = payloadOf(
      makeState({
        primaryAbilities: ['Strength', '', 'Strength'],
        savingThrows: ['Wisdom', ' ', ' Wisdom '],
        skillChoices: ['Nature', '', 'Nature'],
        numSkillChoices: '1',
        armorProficiencies: ['Shields', '', 'Shields'],
        weaponProficiencies: ['Simple weapons', ' ', 'Simple weapons'],
        toolProficiencies: ['Herbalism Kit', '', 'Herbalism Kit'],
      })
    );

    expect(payload).toEqual(
      expect.objectContaining({
        primaryAbilities: ['Strength'],
        savingThrows: ['Wisdom'],
        skillChoices: ['Nature'],
        armorProficiencies: ['Shields'],
        weaponProficiencies: ['Simple weapons'],
        toolProficiencies: ['Herbalism Kit'],
      })
    );
  });

  it('trims feature names and descriptions, and sends a missing description as blank', () => {
    const payload = payloadOf(
      makeState({
        features: [
          { name: '  Rage ', level: 1, description: '  Primal ferocity. ' },
          { name: 'Reckless Attack', level: 2 },
        ],
      })
    );

    expect(payload.features).toEqual([
      { name: 'Rage', level: 1, description: 'Primal ferocity.' },
      { name: 'Reckless Attack', level: 2, description: '' },
    ]);
  });

  it('sends only name, level and description on a feature row, even one carrying an id', () => {
    const withId = { name: 'Rage', level: 1, description: '', id: 'cf-1' } as ClassFeatureDraft;
    const [row] = payloadOf(makeState({ features: [withId] })).features;

    expect(Object.keys(row).sort()).toEqual(['description', 'level', 'name']);
  });

  it('never carries the JSON rule columns, even for a class that has all three', () => {
    const payload = payloadOf(
      classToFormState(
        makeClass({ spellcasting: { ability: 'Wisdom' }, equipmentChoices: { choices: [] } })
      )
    );

    expect('spellcasting' in payload).toBe(false);
    expect('equipmentChoices' in payload).toBe(false);
    expect('multiclassing' in payload).toBe(false);
  });

  it('allows the same feature name at two different levels', () => {
    const payload = payloadOf(
      makeState({
        features: [
          { name: 'Ability Score Improvement', level: 4 },
          { name: 'Ability Score Improvement', level: 8 },
        ],
      })
    );

    expect(payload.features).toHaveLength(2);
  });

  describe('validation', () => {
    it('requires a name', () => {
      expect(formStateToPayload(makeState({ name: '   ' }))).toEqual({
        error: 'Name is required',
      });
    });

    it.each(['-1', '19', '1.5', 'two'])('rejects a skill count of %s', count => {
      expect(formStateToPayload(makeState({ numSkillChoices: count }))).toEqual({
        error: 'Number of skill choices must be a whole number from 0 to 18',
      });
    });

    it('refuses a skill count above the number of skills offered', () => {
      const state = makeState({ skillChoices: ['Athletics', 'Survival'], numSkillChoices: '3' });

      expect(formStateToPayload(state)).toEqual({
        error: "Number of skill choices can't be more than the skills offered (2)",
      });
    });

    it('counts the offered skills after cleaning the list', () => {
      const state = makeState({
        skillChoices: ['Athletics', ' Athletics ', ''],
        numSkillChoices: '2',
      });

      expect(formStateToPayload(state)).toEqual({
        error: "Number of skill choices can't be more than the skills offered (1)",
      });
    });

    it('refuses a positive skill count when no skills are offered', () => {
      expect(formStateToPayload(makeState({ numSkillChoices: '1' }))).toEqual({
        error: "Number of skill choices can't be more than the skills offered (0)",
      });
    });

    it('refuses offered skills with a count of 0 or a blank count', () => {
      const expected = { error: 'Set how many of the offered skills a player picks' };

      expect(
        formStateToPayload(makeState({ skillChoices: ['Athletics'], numSkillChoices: '0' }))
      ).toEqual(expected);
      expect(
        formStateToPayload(makeState({ skillChoices: ['Athletics'], numSkillChoices: '' }))
      ).toEqual(expected);
    });

    it.each(['0', '21', '2.5', 'third'])('rejects a subclass level of %s', level => {
      expect(formStateToPayload(makeState({ subclassLevel: level }))).toEqual({
        error: 'Subclass level must be a whole number from 1 to 20',
      });
    });

    it('requires every feature to have a name that is not just whitespace', () => {
      const state = makeState({
        features: [
          { name: 'Rage', level: 1 },
          { name: '   ', level: 2 },
        ],
      });

      expect(formStateToPayload(state)).toEqual({ error: 'Every feature needs a name' });
    });

    it.each([Number.NaN, 0, 21, 1.5])('rejects a feature level of %s', level => {
      expect(formStateToPayload(makeState({ features: [{ name: 'Rage', level }] }))).toEqual({
        error: 'Every feature needs a level from 1 to 20',
      });
    });

    it('treats "Rage" and "Rage " at the same level as a duplicate, since both send "Rage"', () => {
      const state = makeState({
        features: [
          { name: 'Rage', level: 1 },
          { name: 'Rage ', level: 1 },
        ],
      });

      expect(formStateToPayload(state)).toEqual({
        error: 'Two features share a name at the same level; each pairing must be unique',
      });
    });

    it('reports the first failing check, in order', () => {
      const allWrong = makeState({
        name: '',
        numSkillChoices: '19',
        subclassLevel: '0',
        features: [{ name: '', level: 0 }],
      });

      expect(formStateToPayload(allWrong)).toEqual({ error: 'Name is required' });
      expect(formStateToPayload({ ...allWrong, name: 'Warden' })).toEqual({
        error: 'Number of skill choices must be a whole number from 0 to 18',
      });
      expect(formStateToPayload({ ...allWrong, name: 'Warden', numSkillChoices: '0' })).toEqual({
        error: 'Subclass level must be a whole number from 1 to 20',
      });
      expect(
        formStateToPayload({ ...allWrong, name: 'Warden', numSkillChoices: '0', subclassLevel: '' })
      ).toEqual({ error: 'Every feature needs a name' });
    });
  });

  // Without a baseline both skill rules always apply; the validation tests above cover that.
  describe('with a loaded baseline', () => {
    // How a class created through the API with only a name and hit die loads:
    // the column's default count of 2 against an empty pool.
    const defaultCount = () => makeState({ numSkillChoices: '2', skillChoices: [] });

    it('saves an edit that leaves an over-count empty pool untouched, sending both as stored (VEG-508)', () => {
      const baseline = defaultCount();

      expect(formStateToPayload({ ...baseline, description: 'Fixed a typo.' }, baseline)).toEqual({
        payload: expect.objectContaining({
          description: 'Fixed a typo.',
          numSkillChoices: 2,
          skillChoices: [],
        }),
      });
    });

    it('still refuses a changed count above the pool', () => {
      const baseline = defaultCount();

      expect(formStateToPayload({ ...baseline, numSkillChoices: '1' }, baseline)).toEqual({
        error: "Number of skill choices can't be more than the skills offered (0)",
      });
    });

    it('still refuses adding a skill while the count stays above the new pool', () => {
      const baseline = defaultCount();

      expect(formStateToPayload({ ...baseline, skillChoices: ['Athletics'] }, baseline)).toEqual({
        error: "Number of skill choices can't be more than the skills offered (1)",
      });
    });

    it('saves an untouched pool whose count is 0 (VEG-508)', () => {
      const baseline = makeState({ skillChoices: ['Arcana'], numSkillChoices: '0' });

      expect(formStateToPayload({ ...baseline }, baseline)).toEqual({
        payload: expect.objectContaining({ skillChoices: ['Arcana'], numSkillChoices: 0 }),
      });
    });

    it('treats the same pool in a different order as unchanged (VEG-508)', () => {
      const baseline = makeState({ skillChoices: ['Arcana', 'History'], numSkillChoices: '0' });

      expect(
        formStateToPayload({ ...baseline, skillChoices: ['History', 'Arcana'] }, baseline)
      ).toEqual({
        payload: expect.objectContaining({
          skillChoices: ['History', 'Arcana'],
          numSkillChoices: 0,
        }),
      });
    });

    it('still runs the range check on an unchanged count', () => {
      const baseline = makeState({ numSkillChoices: '19' });

      expect(formStateToPayload({ ...baseline }, baseline)).toEqual({
        error: 'Number of skill choices must be a whole number from 0 to 18',
      });
    });
  });
});
