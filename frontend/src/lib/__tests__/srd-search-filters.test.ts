import { describe, it, expect } from 'vitest';
import { SEARCH_FILTERS, searchFilterParams } from '@/lib/srd-search-filters';

describe('SEARCH_FILTERS', () => {
  it.each(Object.entries(SEARCH_FILTERS))(
    'gives %s fields with unique params and at least one option each',
    (_kind, fields) => {
      expect(fields!.length).toBeGreaterThan(0);
      const params = fields!.map(f => f.param);
      expect(new Set(params).size).toBe(params.length);
      for (const field of fields!) expect(field.options.length).toBeGreaterThan(0);
    }
  );

  it('offers no sub-filters for classes', () => {
    expect(SEARCH_FILTERS.class).toBeUndefined();
  });
});

describe('searchFilterParams', () => {
  it('returns the chosen value for each field and undefined for a blank one', () => {
    expect(searchFilterParams('spell', { class: 'Wizard', level: '' })).toEqual({
      class: 'Wizard',
      level: undefined,
      school: undefined,
    });
  });

  it('emits every field of the kind as undefined when nothing is chosen', () => {
    expect(searchFilterParams('feature', undefined)).toEqual({ parentType: undefined });
  });

  it('ignores values for params the kind does not filter on', () => {
    expect(searchFilterParams('item', { category: 'Ring', school: 'Evocation' })).toEqual({
      category: 'Ring',
      rarity: undefined,
      isMagic: undefined,
    });
  });

  it('returns no params when no single kind is selected', () => {
    expect(searchFilterParams(null, { class: 'Wizard' })).toEqual({});
  });

  it('returns no params for a kind without sub-filters', () => {
    expect(searchFilterParams('class', { class: 'Wizard' })).toEqual({});
  });
});
