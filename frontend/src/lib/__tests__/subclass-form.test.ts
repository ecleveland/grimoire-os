import { describe, it, expect } from 'vitest';
import {
  emptySubclassFormState,
  formStateToPayload,
  subclassToFormState,
  type SubclassFormState,
} from '@/lib/subclass-form';
import type { SrdSubclass } from '@/lib/types';

function makeSubclass(over: Partial<SrdSubclass> = {}): SrdSubclass {
  return {
    id: 'sc-hb',
    name: 'Deadeye',
    classId: 'cls-hb',
    description: 'A patient marksman.',
    features: [
      { id: 'cf-1', name: 'Steady Aim', level: 3, description: 'Hold the shot.' },
      { id: 'cf-2', name: 'Long Watch', level: 7 },
    ],
    source: 'Homebrew',
    contentSource: 'homebrew',
    createdById: 'u1',
    ...over,
  };
}

function makeState(over: Partial<SubclassFormState> = {}): SubclassFormState {
  return { ...emptySubclassFormState(), name: 'Deadeye', ...over };
}

/** The payload for a state expected to validate; fails the test with the error otherwise. */
function payloadOf(state: SubclassFormState, baseline?: SubclassFormState) {
  const result = formStateToPayload(state, baseline);
  if ('error' in result) throw new Error(`expected a payload, got: ${result.error}`);
  return result.payload;
}

describe('emptySubclassFormState', () => {
  it('starts every field empty', () => {
    expect(emptySubclassFormState()).toEqual({ name: '', description: '', features: [] });
  });
});

describe('subclassToFormState', () => {
  it('maps the subclass onto the form, dropping the feature ids the write DTO refuses', () => {
    expect(subclassToFormState(makeSubclass())).toEqual({
      name: 'Deadeye',
      description: 'A patient marksman.',
      features: [
        { name: 'Steady Aim', level: 3, description: 'Hold the shot.' },
        { name: 'Long Watch', level: 7, description: '' },
      ],
    });
  });

  it('reads a missing description and a missing feature list as empty', () => {
    expect(
      subclassToFormState(makeSubclass({ description: undefined, features: undefined }))
    ).toEqual({ name: 'Deadeye', description: '', features: [] });
  });

  it('maps the null description the API sends to an empty box', () => {
    const nulled = makeSubclass({ description: null as unknown as undefined });

    expect(subclassToFormState(nulled).description).toBe('');
  });
});

describe('formStateToPayload', () => {
  it('trims the name and sends a blank description as null', () => {
    expect(payloadOf(makeState({ name: '  Deadeye  ', description: '   ' }))).toEqual({
      name: 'Deadeye',
      description: null,
      features: [],
    });
  });

  it('rejects a blank name', () => {
    expect(formStateToPayload(makeState({ name: '   ' }))).toEqual({ error: 'Name is required' });
  });

  it('sends both name and description on a create', () => {
    expect(payloadOf(makeState({ description: 'A patient marksman.' }))).toStrictEqual({
      name: 'Deadeye',
      description: 'A patient marksman.',
      features: [],
    });
  });

  // An edit sends only what the author changed. The card an edit opens from can
  // be stale (a refetch after the last save failed), and resending its untouched
  // fields would quietly revert that save.
  describe('on an edit', () => {
    const loaded = () => subclassToFormState(makeSubclass());

    it('sends only the name when only the name changed', () => {
      expect(payloadOf({ ...loaded(), name: 'Dead Eye' }, loaded())).toStrictEqual({
        name: 'Dead Eye',
      });
    });

    it('sends only the description when only the description changed', () => {
      expect(payloadOf({ ...loaded(), description: 'Reworded.' }, loaded())).toStrictEqual({
        description: 'Reworded.',
      });
    });

    it('sends a cleared description as null', () => {
      expect(payloadOf({ ...loaded(), description: '   ' }, loaded())).toStrictEqual({
        description: null,
      });
    });

    it('sends nothing when the only differences are whitespace the trim removes', () => {
      const padded = { ...loaded(), name: ' Deadeye ', description: 'A patient marksman.  ' };

      expect(payloadOf(padded, loaded())).toStrictEqual({});
    });

    it('still requires a name', () => {
      expect(formStateToPayload({ ...loaded(), name: '  ' }, loaded())).toEqual({
        error: 'Name is required',
      });
    });
  });

  // The send rules are tested once, in feature-rows.test.ts. This proves the
  // subclass form hands its lists to them and keeps what they return.
  it('sends features only when they changed against the loaded subclass, and surfaces their errors', () => {
    const baseline = subclassToFormState(makeSubclass());

    expect('features' in payloadOf({ ...baseline, description: 'Reworded.' }, baseline)).toBe(
      false
    );
    expect(
      payloadOf({ ...baseline, features: [{ name: 'Killing Shot', level: 15 }] }, baseline).features
    ).toEqual([{ name: 'Killing Shot', level: 15, description: '' }]);
    expect(
      formStateToPayload({ ...baseline, features: [{ name: '', level: 3 }] }, baseline)
    ).toEqual({ error: 'Every feature needs a name' });
  });
});
