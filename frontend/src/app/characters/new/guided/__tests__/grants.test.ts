import { describe, it, expect } from 'vitest';
import {
  setSourceSlice,
  setSourceField,
  clearSource,
  compileGrantFields,
  type GrantRegistry,
} from '../grants';

describe('grants registry', () => {
  describe('compileGrantFields', () => {
    it('returns empty arrays for an empty registry', () => {
      expect(compileGrantFields({})).toEqual({ skills: [], proficiencies: [], languages: [] });
    });

    it('unions a field across sources in source order, stable-deduping', () => {
      const reg: GrantRegistry = {
        class: { skills: ['Insight'] },
        background: { skills: ['Insight', 'Religion'] },
      };
      // Insight (class) appears once, positioned where the class put it; Religion follows.
      expect(compileGrantFields(reg).skills).toEqual(['Insight', 'Religion']);
    });

    it('compiles each field independently', () => {
      const reg: GrantRegistry = {
        class: { proficiencies: ['Martial weapons'] },
        background: { proficiencies: ['Gaming Set'], skills: ['Athletics'] },
        species: { languages: ['Common', 'Elvish'] },
      };
      expect(compileGrantFields(reg)).toEqual({
        skills: ['Athletics'],
        proficiencies: ['Martial weapons', 'Gaming Set'],
        languages: ['Common', 'Elvish'],
      });
    });
  });

  describe('setSourceSlice', () => {
    it('replaces a source slice wholesale (no delta accumulation)', () => {
      let reg = setSourceSlice({}, 'class', { skills: ['Athletics', 'History'] });
      reg = setSourceSlice(reg, 'class', { skills: ['Arcana'], proficiencies: ['Daggers'] });
      expect(reg.class).toEqual({ skills: ['Arcana'], proficiencies: ['Daggers'] });
    });

    it('leaves other sources untouched', () => {
      let reg = setSourceSlice({}, 'background', { skills: ['Insight'] });
      reg = setSourceSlice(reg, 'class', { skills: ['Arcana'] });
      expect(reg.background).toEqual({ skills: ['Insight'] });
    });

    it('does not mutate the input registry', () => {
      const reg: GrantRegistry = { class: { skills: ['A'] } };
      const next = setSourceSlice(reg, 'class', { skills: ['B'] });
      expect(reg.class).toEqual({ skills: ['A'] });
      expect(next).not.toBe(reg);
    });
  });

  describe('setSourceField', () => {
    it('updates one field of a source slice, preserving the others', () => {
      let reg = setSourceSlice({}, 'class', { skills: [], proficiencies: ['Daggers'] });
      reg = setSourceField(reg, 'class', 'skills', ['Arcana', 'History']);
      expect(reg.class).toEqual({ skills: ['Arcana', 'History'], proficiencies: ['Daggers'] });
    });

    it('creates the source slice when absent', () => {
      const reg = setSourceField({}, 'class', 'skills', ['Arcana']);
      expect(reg.class).toEqual({ skills: ['Arcana'] });
    });
  });

  describe('clearSource', () => {
    it('drops exactly that source, leaving the rest intact', () => {
      const reg: GrantRegistry = {
        class: { skills: ['Arcana'] },
        background: { skills: ['Insight'], proficiencies: ['Gaming Set'] },
      };
      const next = clearSource(reg, 'background');
      expect(next.background).toBeUndefined();
      expect(next.class).toEqual({ skills: ['Arcana'] });
    });

    it('is a no-op for a source that is not present', () => {
      const reg: GrantRegistry = { class: { skills: ['Arcana'] } };
      expect(clearSource(reg, 'background')).toEqual(reg);
    });
  });

  describe('reconciliation invariants (the VEG-393 bugs)', () => {
    it('keeps a value still granted by a surviving source when one source is cleared', () => {
      // Bug 1: Insight granted by BOTH a class pick and a background; clearing the
      // background must not strip the class pick.
      let reg = setSourceSlice({}, 'class', { skills: ['Insight'] });
      reg = setSourceSlice(reg, 'background', { skills: ['Insight', 'Religion'] });
      reg = clearSource(reg, 'background');
      expect(compileGrantFields(reg).skills).toEqual(['Insight']);
    });

    it('replacing one source never drops another source contribution', () => {
      // Bug 2: class proficiencies replaced wholesale must not drop a background tool prof.
      let reg = setSourceSlice({}, 'class', { proficiencies: ['Simple weapons'] });
      reg = setSourceSlice(reg, 'background', { proficiencies: ['Gaming Set'] });
      reg = setSourceSlice(reg, 'class', { proficiencies: ['Martial weapons'] });
      expect(compileGrantFields(reg).proficiencies).toEqual(['Martial weapons', 'Gaming Set']);
    });

    it('keeps a thrice-granted value (with its first position) when one source is cleared', () => {
      // Three sources grant "Common"; clearing the first holder must keep the
      // value and not shift it out of its stable SOURCE_ORDER position.
      let reg = setSourceSlice({}, 'class', { languages: ['Common'] });
      reg = setSourceSlice(reg, 'background', { languages: ['Common'] });
      reg = setSourceSlice(reg, 'species', { languages: ['Common', 'Elvish'] });
      expect(compileGrantFields(reg).languages).toEqual(['Common', 'Elvish']);
      reg = clearSource(reg, 'class');
      // Still present (background + species hold it), now first-occurring at
      // background's slot — still position 0.
      expect(compileGrantFields(reg).languages).toEqual(['Common', 'Elvish']);
    });

    it('is idempotent: applying the same source slice twice equals applying it once', () => {
      const once = setSourceSlice({}, 'species', { languages: ['Common', 'Elvish'] });
      const twice = setSourceSlice(once, 'species', { languages: ['Common', 'Elvish'] });
      expect(compileGrantFields(twice)).toEqual(compileGrantFields(once));
    });
  });
});
