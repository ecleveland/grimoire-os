import { describe, it, expect } from 'vitest';
import { sameFeatures, toFeatureRows, validateFeatures, type FeatureRow } from '@/lib/feature-rows';
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
