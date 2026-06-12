import { describe, it, expect } from 'vitest';
import {
  emptyFeatFormState,
  featToFormState,
  formStateToPayload,
  parseBenefitLines,
} from '@/lib/feat-form';
import type { SrdFeat } from '@/lib/types';

const shieldMaster: SrdFeat = {
  id: 'hb-1',
  name: 'Shield Master',
  description: 'You use shields not just for protection but also for offense.',
  prerequisite: 'Level 4+',
  benefits: ['Shield Bash: You can shove with your shield.', 'Interpose: +2 to Dex saves.'],
  category: 'General',
  repeatable: true,
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

describe('parseBenefitLines', () => {
  it('splits on newlines, trims, and drops blank lines', () => {
    expect(parseBenefitLines('  One \n\n Two \n   \nThree')).toEqual(['One', 'Two', 'Three']);
  });

  it('returns an empty array for blank input', () => {
    expect(parseBenefitLines('   \n  ')).toEqual([]);
  });
});

describe('emptyFeatFormState', () => {
  it('starts blank with repeatable off', () => {
    expect(emptyFeatFormState()).toEqual({
      name: '',
      description: '',
      prerequisite: '',
      benefits: '',
      category: '',
      repeatable: false,
    });
  });
});

describe('featToFormState', () => {
  it('maps a feat onto editable strings, one benefit per line', () => {
    expect(featToFormState(shieldMaster)).toEqual({
      name: 'Shield Master',
      description: 'You use shields not just for protection but also for offense.',
      prerequisite: 'Level 4+',
      benefits: 'Shield Bash: You can shove with your shield.\nInterpose: +2 to Dex saves.',
      category: 'General',
      repeatable: true,
    });
  });

  it('renders absent optional fields as empty strings', () => {
    const minimal: SrdFeat = {
      id: 'f1',
      name: 'Tough',
      description: 'Extra HP.',
      source: 'SRD 5.2.1',
      contentSource: 'srd',
    };
    expect(featToFormState(minimal)).toEqual({
      name: 'Tough',
      description: 'Extra HP.',
      prerequisite: '',
      benefits: '',
      category: '',
      repeatable: false,
    });
  });
});

describe('formStateToPayload', () => {
  function validState(over: Partial<ReturnType<typeof emptyFeatFormState>> = {}) {
    return {
      ...emptyFeatFormState(),
      name: 'Shield Master',
      description: 'A sturdy feat.',
      ...over,
    };
  }

  it('builds a payload from a fully-populated state', () => {
    const result = formStateToPayload(
      validState({
        prerequisite: ' Level 4+ ',
        benefits: 'One\nTwo',
        category: 'General',
        repeatable: true,
      })
    );

    expect(result).toEqual({
      payload: {
        name: 'Shield Master',
        description: 'A sturdy feat.',
        prerequisite: 'Level 4+',
        benefits: ['One', 'Two'],
        category: 'General',
        repeatable: true,
      },
    });
  });

  it('serializes cleared optional fields as null so a PATCH actually clears them (VEG-316)', () => {
    const result = formStateToPayload(validState());

    expect(result).toEqual({
      payload: expect.objectContaining({
        prerequisite: null,
        benefits: null,
        category: null,
        repeatable: false,
      }),
    });
  });

  it('rejects a blank name', () => {
    expect(formStateToPayload(validState({ name: '   ' }))).toEqual({
      error: 'Name is required',
    });
  });

  it('rejects a blank description', () => {
    expect(formStateToPayload(validState({ description: '' }))).toEqual({
      error: 'Description is required',
    });
  });

  it('trims name and description', () => {
    const result = formStateToPayload(validState({ name: '  Tough  ', description: ' HP. ' }));
    expect(result).toEqual({
      payload: expect.objectContaining({ name: 'Tough', description: 'HP.' }),
    });
  });
});
