import { describe, it, expect } from 'vitest';
import {
  emptySpellFormState,
  spellToFormState,
  formStateToPayload,
  parseCommaList,
} from '../spell-form';
import type { SrdSpell } from '@/lib/types';

const fireball: SrdSpell = {
  id: 'hb-1',
  name: 'Soul Bonfire',
  level: 3,
  school: 'Evocation',
  castingTime: '1 action',
  range: '150 feet',
  components: 'V, S, M',
  duration: 'Instantaneous',
  description: 'A bright streak flashes from your pointing finger.',
  classes: ['Sorcerer', 'Wizard'],
  ritual: false,
  concentration: true,
  material: 'A tiny ball of bat guano and sulfur',
  higherLevels: 'When cast with a higher slot, damage increases by 1d6.',
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

describe('parseCommaList', () => {
  it('splits on commas and trims blanks', () => {
    expect(parseCommaList(' Bard , Cleric,, ')).toEqual(['Bard', 'Cleric']);
  });

  it('returns empty array for blank input', () => {
    expect(parseCommaList('   ')).toEqual([]);
  });
});

describe('spellToFormState / formStateToPayload round-trip', () => {
  it('maps a spell into editable strings', () => {
    const state = spellToFormState(fireball);

    expect(state.name).toBe('Soul Bonfire');
    expect(state.level).toBe('3');
    expect(state.school).toBe('Evocation');
    expect(state.classes).toBe('Sorcerer, Wizard');
    expect(state.concentration).toBe(true);
    expect(state.ritual).toBe(false);
    expect(state.material).toBe('A tiny ball of bat guano and sulfur');
    expect(state.higherLevels).toBe('When cast with a higher slot, damage increases by 1d6.');
  });

  it('round-trips back into an API payload', () => {
    const result = formStateToPayload(spellToFormState(fireball));

    expect(result).toEqual({
      payload: {
        name: 'Soul Bonfire',
        level: 3,
        school: 'Evocation',
        castingTime: '1 action',
        range: '150 feet',
        components: 'V, S, M',
        duration: 'Instantaneous',
        description: 'A bright streak flashes from your pointing finger.',
        classes: ['Sorcerer', 'Wizard'],
        ritual: false,
        concentration: true,
        material: 'A tiny ball of bat guano and sulfur',
        higherLevels: 'When cast with a higher slot, damage increases by 1d6.',
      },
    });
  });

  it('maps a cantrip (level 0) through correctly', () => {
    const result = formStateToPayload(spellToFormState({ ...fireball, level: 0 }));
    expect('payload' in result && result.payload.level).toBe(0);
  });

  it('sends cleared optional fields as null so the backend actually clears them (VEG-316)', () => {
    const state = { ...spellToFormState(fireball), material: '', higherLevels: '' };

    const result = formStateToPayload(state);

    expect('payload' in result && result.payload.material).toBeNull();
    expect('payload' in result && result.payload.higherLevels).toBeNull();
  });

  it('accepts a minimal valid form', () => {
    const state = {
      ...emptySpellFormState(),
      name: 'Spark',
      level: '0',
      school: 'Evocation',
      castingTime: '1 action',
      range: 'Touch',
      components: 'V',
      duration: 'Instantaneous',
      description: 'A small spark.',
    };

    const result = formStateToPayload(state);

    expect('payload' in result).toBe(true);
    if ('payload' in result) {
      expect(result.payload.level).toBe(0);
      expect(result.payload.classes).toEqual([]);
      expect(result.payload.material).toBeNull();
      expect(result.payload.ritual).toBe(false);
      expect(result.payload.concentration).toBe(false);
    }
  });

  it.each([
    ['name', { name: '   ' }, /name/i],
    ['school', { school: '' }, /school/i],
    ['castingTime', { castingTime: '' }, /casting time/i],
    ['range', { range: '' }, /range/i],
    ['components', { components: '' }, /components/i],
    ['duration', { duration: '' }, /duration/i],
    ['description', { description: '' }, /description/i],
    ['level too high', { level: '10' }, /level/i],
    ['level negative', { level: '-1' }, /level/i],
    ['level non-integer', { level: 'cantrip' }, /level/i],
  ])('rejects invalid %s', (_label, override, message) => {
    const state = {
      ...emptySpellFormState(),
      name: 'Spark',
      level: '0',
      school: 'Evocation',
      castingTime: '1 action',
      range: 'Touch',
      components: 'V',
      duration: 'Instantaneous',
      description: 'A small spark.',
      ...override,
    };

    const result = formStateToPayload(state);

    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toMatch(message);
  });
});
