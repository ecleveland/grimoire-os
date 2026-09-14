import { describe, it, expect } from 'vitest';
import {
  emptySubclassFormState,
  formStateToPayload,
  subclassToFormState,
  type SubclassFormState,
} from '@/lib/subclass-form';
import { MAX_LEVEL } from '@/lib/character-level';
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

  it('sends every feature on a create, trimmed and without ids', () => {
    const payload = payloadOf(
      makeState({ features: [{ name: '  Steady Aim  ', level: 3, description: '  Hold.  ' }] })
    );

    expect(payload.features).toEqual([{ name: 'Steady Aim', level: 3, description: 'Hold.' }]);
  });

  describe('features against a baseline', () => {
    const loaded = () => subclassToFormState(makeSubclass());

    it('omits the key when the list is untouched', () => {
      const baseline = loaded();

      expect('features' in payloadOf({ ...baseline }, baseline)).toBe(false);
    });

    it('omits the key when only the row order changed', () => {
      const baseline = loaded();
      const reordered = { ...baseline, features: [...baseline.features].reverse() };

      expect('features' in payloadOf(reordered, baseline)).toBe(false);
    });

    it('sends the whole list when a description changed', () => {
      const baseline = loaded();
      const [aim, watch] = baseline.features;
      const edited = { ...baseline, features: [aim, { ...watch, description: 'Never blink.' }] };

      expect(payloadOf(edited, baseline).features).toEqual([
        { name: 'Steady Aim', level: 3, description: 'Hold the shot.' },
        { name: 'Long Watch', level: 7, description: 'Never blink.' },
      ]);
    });

    it('sends the whole list when a row is added or removed', () => {
      const baseline = loaded();
      const added = {
        ...baseline,
        features: [...baseline.features, { name: 'Killing Shot', level: 15 }],
      };
      const removed = { ...baseline, features: [baseline.features[0]] };

      expect(payloadOf(added, baseline).features).toHaveLength(3);
      expect(payloadOf(removed, baseline).features).toHaveLength(1);
    });

    it('sends the list on a create, where there is no baseline at all', () => {
      expect(payloadOf(makeState()).features).toEqual([]);
    });
  });

  describe('feature validation', () => {
    it('reports a blank feature name', () => {
      expect(formStateToPayload(makeState({ features: [{ name: '  ', level: 3 }] }))).toEqual({
        error: 'Every feature needs a name',
      });
    });

    it('reports an out-of-range level', () => {
      expect(
        formStateToPayload(makeState({ features: [{ name: 'Steady Aim', level: 0 }] }))
      ).toEqual({ error: `Every feature needs a level from 1 to ${MAX_LEVEL}` });
    });

    it('reports two rows sharing a name at the same level', () => {
      const features = [
        { name: 'Steady Aim', level: 3 },
        { name: 'Steady Aim', level: 3 },
      ];

      expect(formStateToPayload(makeState({ features }))).toEqual({
        error: 'Two features share a name at the same level; each pairing must be unique',
      });
    });

    it('lets a name at two different levels through', () => {
      const features = [
        { name: 'Steady Aim', level: 3 },
        { name: 'Steady Aim', level: 7 },
      ];

      expect(payloadOf(makeState({ features })).features).toHaveLength(2);
    });

    it('leaves a stored row this form would reject alone when the list is untouched', () => {
      const baseline = subclassToFormState(
        makeSubclass({ features: [{ id: 'cf-1', name: '', level: 3 }] })
      );
      const edited = { ...baseline, description: 'Reworded.' };

      const payload = payloadOf(edited, baseline);
      expect('features' in payload).toBe(false);
      expect(payload.description).toBe('Reworded.');
    });
  });
});
