import { describe, it, expect } from 'vitest';
import {
  featureDraftsFrom,
  featuresToSend,
  sameFeatures,
  toFeatureRows,
  validateFeatures,
  type FeatureRow,
} from '@/lib/feature-rows';
import { MAX_LEVEL } from '@/lib/character-level';
import type { ClassFeatureDraft } from '@/components/ClassFeaturesEditor';

function row(over: Partial<FeatureRow> = {}): FeatureRow {
  return { name: 'Rage', level: 1, description: '', ...over };
}

describe('toFeatureRows', () => {
  it('trims the name and the description, and defaults a missing description to empty', () => {
    const drafts: ClassFeatureDraft[] = [
      { name: '  Rage  ', level: 1, description: '  Swing hard.  ' },
      { name: 'Reckless Attack', level: 2 },
    ];

    expect(toFeatureRows(drafts)).toEqual([
      { name: 'Rage', level: 1, description: 'Swing hard.' },
      { name: 'Reckless Attack', level: 2, description: '' },
    ]);
  });

  it('keeps the level untouched, including the NaN a cleared level box holds', () => {
    const [only] = toFeatureRows([{ name: 'Rage', level: Number.NaN }]);

    expect(only.level).toBeNaN();
  });
});

describe('sameFeatures', () => {
  it('ignores row order', () => {
    const a = [row(), row({ name: 'Reckless Attack', level: 2 })];

    expect(sameFeatures(a, [...a].reverse())).toBe(true);
  });

  it('is false when a description differs', () => {
    expect(sameFeatures([row()], [row({ description: 'Swing hard.' })])).toBe(false);
  });

  it('is false when a name, a level, or the count differs', () => {
    expect(sameFeatures([row()], [row({ name: 'Fury' })])).toBe(false);
    expect(sameFeatures([row()], [row({ level: 2 })])).toBe(false);
    expect(sameFeatures([row()], [row(), row({ level: 2 })])).toBe(false);
  });

  it('counts duplicates rather than matching them by membership', () => {
    expect(sameFeatures([row(), row()], [row(), row({ level: 2 })])).toBe(false);
  });

  it('is true for two empty lists', () => {
    expect(sameFeatures([], [])).toBe(true);
  });
});

describe('validateFeatures', () => {
  it('passes a valid list, including one name used at two levels', () => {
    expect(validateFeatures([])).toBeNull();
    expect(
      validateFeatures([
        row({ name: 'Ability Score Improvement', level: 4 }),
        row({ name: 'Ability Score Improvement', level: 8 }),
      ])
    ).toBeNull();
  });

  it('rejects a blank name', () => {
    expect(validateFeatures([row({ name: '' })])).toBe('Every feature needs a name');
  });

  it('rejects a level that is not a whole number in range', () => {
    const message = `Every feature needs a level from 1 to ${MAX_LEVEL}`;
    expect(validateFeatures([row({ level: Number.NaN })])).toBe(message);
    expect(validateFeatures([row({ level: 1.5 })])).toBe(message);
    expect(validateFeatures([row({ level: 0 })])).toBe(message);
    expect(validateFeatures([row({ level: MAX_LEVEL + 1 })])).toBe(message);
  });

  it('rejects two rows sharing a name at the same level', () => {
    expect(validateFeatures([row(), row()])).toBe(
      'Two features share a name at the same level; each pairing must be unique'
    );
  });
});

describe('featureDraftsFrom', () => {
  it('keeps name, level and description, defaulting a missing description to empty', () => {
    expect(
      featureDraftsFrom([
        { id: 'cf-1', name: 'Rage', level: 1, description: 'Primal ferocity.' },
        { id: 'cf-2', name: 'Reckless Attack', level: 2 },
      ])
    ).toEqual([
      { name: 'Rage', level: 1, description: 'Primal ferocity.' },
      { name: 'Reckless Attack', level: 2, description: '' },
    ]);
  });

  it('maps the null description the API sends to empty', () => {
    const [draft] = featureDraftsFrom([
      { name: 'Rage', level: 1, description: null as unknown as undefined },
    ]);

    expect(draft.description).toBe('');
  });

  // The write DTO refuses any key it doesn't whitelist, so an API row's id, or a
  // key the shared type doesn't declare, must not ride along into the draft.
  it('drops the id and every other key an API row carries', () => {
    const apiRow = { id: 'cf-1', name: 'Rage', level: 1, classId: 'cls-1', createdAt: 'now' };

    const [draft] = featureDraftsFrom([apiRow]);

    expect(Object.keys(draft).sort()).toEqual(['description', 'level', 'name']);
  });

  it('reads a missing list as empty', () => {
    expect(featureDraftsFrom(undefined)).toEqual([]);
  });
});

describe('featuresToSend', () => {
  const loaded = (): ClassFeatureDraft[] => [
    { name: 'Rage', level: 1, description: 'Primal ferocity.' },
    { name: 'Reckless Attack', level: 2, description: 'Swing wild.' },
  ];

  describe('without a baseline, as on a create', () => {
    it('sends every row trimmed, and an empty list as empty', () => {
      expect(
        featuresToSend([
          { name: '  Rage ', level: 1, description: '  Primal ferocity. ' },
          { name: 'Reckless Attack', level: 2 },
        ])
      ).toEqual({
        features: [
          { name: 'Rage', level: 1, description: 'Primal ferocity.' },
          { name: 'Reckless Attack', level: 2, description: '' },
        ],
      });
      expect(featuresToSend([])).toEqual({ features: [] });
    });

    it('sends only name, level and description, even from a row carrying an id', () => {
      const withId = { name: 'Rage', level: 1, id: 'cf-1' } as unknown as ClassFeatureDraft;

      const sent = featuresToSend([withId]);

      expect(sent).toEqual({ features: [{ name: 'Rage', level: 1, description: '' }] });
    });

    it('validates every row', () => {
      expect(featuresToSend([{ name: '   ', level: 2 }])).toEqual({
        error: 'Every feature needs a name',
      });
      expect(featuresToSend([{ name: 'Rage', level: 0 }])).toEqual({
        error: `Every feature needs a level from 1 to ${MAX_LEVEL}`,
      });
    });

    it('reads "Rage" and "Rage " at one level as a duplicate, since both send "Rage"', () => {
      expect(
        featuresToSend([
          { name: 'Rage', level: 1 },
          { name: 'Rage ', level: 1 },
        ])
      ).toEqual({
        error: 'Two features share a name at the same level; each pairing must be unique',
      });
    });
  });

  describe('against a loaded baseline', () => {
    it('sends nothing, not even the key, for a list that matches it', () => {
      const sent = featuresToSend(loaded(), loaded());

      expect(sent).toEqual({});
      expect('features' in sent).toBe(false);
    });

    it('sends nothing for a list that was only reordered', () => {
      expect(featuresToSend([...loaded()].reverse(), loaded())).toEqual({});
    });

    it('sends nothing when the only difference is whitespace the trim removes', () => {
      const padded = loaded().map(f => ({ ...f, name: ` ${f.name} ` }));

      expect(featuresToSend(padded, loaded())).toEqual({});
    });

    it('sends the whole list when a description changed', () => {
      const [rage, reckless] = loaded();

      expect(
        featuresToSend([rage, { ...reckless, description: 'Swing wilder.' }], loaded())
      ).toEqual({
        features: [
          { name: 'Rage', level: 1, description: 'Primal ferocity.' },
          { name: 'Reckless Attack', level: 2, description: 'Swing wilder.' },
        ],
      });
    });

    it('sends the whole list when a row was added, removed or renamed', () => {
      const [rage, reckless] = loaded();
      const sentRows = (current: ClassFeatureDraft[]) => {
        const sent = featuresToSend(current, loaded());
        return 'features' in sent ? sent.features : sent;
      };

      expect(sentRows([rage, reckless, { name: 'Brutal Critical', level: 9 }])).toHaveLength(3);
      expect(sentRows([rage])).toEqual([
        { name: 'Rage', level: 1, description: 'Primal ferocity.' },
      ]);
      expect(sentRows([{ ...rage, name: 'Fury' }, reckless])).toEqual([
        { name: 'Fury', level: 1, description: 'Primal ferocity.' },
        { name: 'Reckless Attack', level: 2, description: 'Swing wild.' },
      ]);
    });
  });

  // The write DTO and the unique index compare raw names, while the forms trim
  // them, so the API can hold rows these rules reject.
  describe('stored rows the rules would reject', () => {
    const collidingOnTrim = (): ClassFeatureDraft[] => [
      { name: 'Rage', level: 1, description: '' },
      { name: 'Rage ', level: 1, description: '' },
    ];

    it('does not block a save that leaves the list alone', () => {
      expect(featuresToSend(collidingOnTrim(), collidingOnTrim())).toEqual({});
      const blank: ClassFeatureDraft[] = [{ name: '', level: 1, description: 'Half drafted.' }];
      expect(featuresToSend(blank, blank)).toEqual({});
    });

    it('validates the list once a change means it is sent', () => {
      const [rage, spaced] = collidingOnTrim();

      expect(featuresToSend([rage, { ...spaced, name: 'Fury' }], collidingOnTrim())).toEqual({
        features: [
          { name: 'Rage', level: 1, description: '' },
          { name: 'Fury', level: 1, description: '' },
        ],
      });
      expect(
        featuresToSend([...collidingOnTrim(), { name: 'Fury', level: 3 }], collidingOnTrim())
      ).toEqual({
        error: 'Two features share a name at the same level; each pairing must be unique',
      });
    });

    it('still refuses a blank name on a row the author added', () => {
      const baseline: ClassFeatureDraft[] = [{ name: 'Rage', level: 1, description: '' }];

      expect(featuresToSend([...baseline, { name: '', level: 3 }], baseline)).toEqual({
        error: 'Every feature needs a name',
      });
    });
  });
});
