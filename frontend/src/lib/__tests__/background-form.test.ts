import { describe, it, expect } from 'vitest';
import {
  emptyBackgroundFormState,
  backgroundToFormState,
  formStateToPayload,
  parseLines,
  type BackgroundFormState,
} from '@/lib/background-form';
import type { SrdBackground } from '@/lib/types';

function makeState(over: Partial<BackgroundFormState> = {}): BackgroundFormState {
  return { ...emptyBackgroundFormState(), name: 'Gravedigger', ...over };
}

const FULL_BG: SrdBackground = {
  id: 'bg-1',
  name: 'Gravedigger',
  description: 'Tending the resting places of the dead.',
  skillProficiencies: ['Insight', 'Religion'],
  toolProficiencies: ["Mason's Tools"],
  languages: 1,
  equipment: 'A shovel',
  personalityTraits: ['Quiet vigil.'],
  ideals: ['Respect.'],
  bonds: ['The sexton.'],
  flaws: ['Speaks to the dead.'],
  originFeat: { id: 'feat-mi', name: 'Magic Initiate' },
  originFeatOption: 'Cleric',
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

describe('parseLines', () => {
  it('splits on newlines, trims, and drops blanks', () => {
    expect(parseLines('  Insight \n\n Religion\n')).toEqual(['Insight', 'Religion']);
  });
});

describe('backgroundToFormState', () => {
  it('maps every field including the origin feat pick', () => {
    const state = backgroundToFormState(FULL_BG);

    expect(state).toEqual({
      name: 'Gravedigger',
      description: 'Tending the resting places of the dead.',
      skillProficiencies: 'Insight\nReligion',
      toolProficiencies: "Mason's Tools",
      languages: '1',
      equipment: 'A shovel',
      personalityTraits: 'Quiet vigil.',
      ideals: 'Respect.',
      bonds: 'The sexton.',
      flaws: 'Speaks to the dead.',
      originFeatName: 'Magic Initiate',
      originFeatId: 'feat-mi',
      originFeatOption: 'Cleric',
    });
  });

  it('maps a background without an origin feat to an empty pick', () => {
    const state = backgroundToFormState({ ...FULL_BG, originFeat: null, originFeatOption: null });

    expect(state.originFeatName).toBe('');
    expect(state.originFeatId).toBeNull();
    expect(state.originFeatOption).toBe('');
  });
});

describe('formStateToPayload', () => {
  it('requires a name', () => {
    expect(formStateToPayload(makeState({ name: '  ' }))).toEqual({ error: 'Name is required' });
  });

  it('rejects a negative or fractional languages value', () => {
    expect(formStateToPayload(makeState({ languages: '-1' }))).toEqual({
      error: 'Languages must be a whole number of 0 or more',
    });
    expect(formStateToPayload(makeState({ languages: '1.5' }))).toEqual({
      error: 'Languages must be a whole number of 0 or more',
    });
  });

  it('rejects a typed feat name that was never picked from the list', () => {
    const result = formStateToPayload(makeState({ originFeatName: 'Alert', originFeatId: null }));

    expect(result).toEqual({
      error: 'Pick the origin feat from the list (SRD or one of your homebrew feats)',
    });
  });

  it('serializes cleared optional fields as null so a PATCH actually clears them (VEG-316)', () => {
    const result = formStateToPayload(makeState());

    expect(result).toEqual({
      payload: {
        name: 'Gravedigger',
        description: null,
        skillProficiencies: [],
        toolProficiencies: [],
        languages: 0,
        equipment: null,
        personalityTraits: [],
        ideals: [],
        bonds: [],
        flaws: [],
        originFeatId: null,
        originFeatOption: null,
      },
    });
  });

  it('builds a full payload from a picked feat and populated lists', () => {
    const result = formStateToPayload(
      makeState({
        description: ' Tending graves. ',
        skillProficiencies: 'Insight\nReligion',
        languages: '2',
        originFeatName: 'Magic Initiate',
        originFeatId: 'feat-mi',
        originFeatOption: 'Cleric',
      })
    );

    expect(result).toEqual({
      payload: expect.objectContaining({
        description: 'Tending graves.',
        skillProficiencies: ['Insight', 'Religion'],
        languages: 2,
        originFeatId: 'feat-mi',
        originFeatOption: 'Cleric',
      }),
    });
  });

  it('never sends an option without a feat — clearing the feat clears the option', () => {
    const result = formStateToPayload(
      makeState({ originFeatName: '', originFeatId: null, originFeatOption: 'Cleric' })
    );

    expect(result).toEqual({
      payload: expect.objectContaining({ originFeatId: null, originFeatOption: null }),
    });
  });
});
