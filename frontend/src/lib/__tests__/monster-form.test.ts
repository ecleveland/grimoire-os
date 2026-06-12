import { describe, it, expect } from 'vitest';
import {
  emptyMonsterFormState,
  monsterToFormState,
  formStateToPayload,
  parseBonusList,
  parseCommaList,
  parseCr,
} from '../monster-form';
import type { SrdMonster } from '@/lib/types';

const troll: SrdMonster = {
  id: 'hb-1',
  name: 'Cave Troll',
  size: 'Large',
  type: 'Giant',
  subtype: 'troll',
  alignment: 'chaotic evil',
  armorClass: 15,
  armorType: 'natural armor',
  hitPoints: 84,
  hitDice: '8d10 + 40',
  speed: '30 ft.',
  str: 18,
  dex: 13,
  con: 20,
  int: 7,
  wis: 9,
  cha: 7,
  savingThrows: { str: 7, con: 9 },
  skills: { perception: 2 },
  damageResistances: ['cold', 'fire'],
  damageImmunities: ['poison'],
  damageVulnerabilities: [],
  conditionImmunities: ['poisoned'],
  senses: 'darkvision 60 ft.',
  languages: 'Giant',
  challengeRating: 5,
  experiencePoints: 1800,
  specialAbilities: [{ name: 'Regeneration', description: 'Regains 10 hp.' }],
  actions: [{ name: 'Slam', description: '+7 to hit.' }],
  reactions: [],
  legendaryActions: [],
  description: 'A big troll.',
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

describe('parseCommaList', () => {
  it('splits on commas and trims blanks', () => {
    expect(parseCommaList(' cold , fire,, ')).toEqual(['cold', 'fire']);
  });

  it('returns empty array for blank input', () => {
    expect(parseCommaList('   ')).toEqual([]);
  });
});

describe('parseBonusList', () => {
  it('parses "name +n" pairs into a record', () => {
    expect(parseBonusList('str +7, con 9')).toEqual({ str: 7, con: 9 });
  });

  it('supports negative bonuses and multi-word names', () => {
    expect(parseBonusList('animal handling -1')).toEqual({ 'animal handling': -1 });
  });

  it('returns null for entries without a numeric bonus', () => {
    expect(parseBonusList('str seven')).toBeNull();
  });

  it('returns an empty record for blank input', () => {
    expect(parseBonusList('  ')).toEqual({});
  });
});

describe('parseCr', () => {
  it('parses plain numbers', () => {
    expect(parseCr('5')).toBe(5);
  });

  it('parses fractions like 1/4', () => {
    expect(parseCr('1/4')).toBe(0.25);
  });

  it('parses decimals', () => {
    expect(parseCr('0.125')).toBe(0.125);
  });

  it('returns null for junk', () => {
    expect(parseCr('boss')).toBeNull();
    expect(parseCr('1/0')).toBeNull();
    expect(parseCr('')).toBeNull();
  });
});

describe('monsterToFormState / formStateToPayload round-trip', () => {
  it('maps a monster into editable strings', () => {
    const state = monsterToFormState(troll);

    expect(state.name).toBe('Cave Troll');
    expect(state.armorClass).toBe('15');
    expect(state.challengeRating).toBe('5');
    expect(state.savingThrows).toBe('str +7, con +9');
    expect(state.skills).toBe('perception +2');
    expect(state.damageResistances).toBe('cold, fire');
    expect(state.actions).toEqual([{ name: 'Slam', description: '+7 to hit.' }]);
  });

  it('round-trips back into an API payload', () => {
    const result = formStateToPayload(monsterToFormState(troll));

    expect(result).toEqual({
      payload: {
        name: 'Cave Troll',
        size: 'Large',
        type: 'Giant',
        subtype: 'troll',
        alignment: 'chaotic evil',
        armorClass: 15,
        armorType: 'natural armor',
        hitPoints: 84,
        hitDice: '8d10 + 40',
        speed: '30 ft.',
        str: 18,
        dex: 13,
        con: 20,
        int: 7,
        wis: 9,
        cha: 7,
        savingThrows: { str: 7, con: 9 },
        skills: { perception: 2 },
        damageResistances: ['cold', 'fire'],
        damageImmunities: ['poison'],
        damageVulnerabilities: [],
        conditionImmunities: ['poisoned'],
        senses: 'darkvision 60 ft.',
        languages: 'Giant',
        challengeRating: 5,
        experiencePoints: 1800,
        specialAbilities: [{ name: 'Regeneration', description: 'Regains 10 hp.' }],
        actions: [{ name: 'Slam', description: '+7 to hit.' }],
        reactions: [],
        legendaryActions: [],
        description: 'A big troll.',
      },
    });
  });

  it('sends cleared optional fields as null so the backend actually clears them (VEG-316)', () => {
    const state = { ...monsterToFormState(troll), senses: '', description: '', subtype: '' };

    const result = formStateToPayload(state);

    expect('payload' in result && result.payload.senses).toBeNull();
    expect('payload' in result && result.payload.description).toBeNull();
    expect('payload' in result && result.payload.subtype).toBeNull();
  });

  it('accepts a minimal valid form', () => {
    const state = {
      ...emptyMonsterFormState(),
      name: 'Rat King',
      size: 'Medium',
      type: 'Beast',
      armorClass: '12',
      hitPoints: '20',
      speed: '20 ft.',
      challengeRating: '1/2',
    };

    const result = formStateToPayload(state);

    expect('payload' in result).toBe(true);
    if ('payload' in result) {
      expect(result.payload.challengeRating).toBe(0.5);
      expect(result.payload.actions).toEqual([]);
      expect(result.payload.savingThrows).toBeNull();
      expect(result.payload.str).toBe(10);
    }
  });

  it.each([
    ['name', { name: '   ' }, /name/i],
    ['armorClass', { armorClass: 'heavy' }, /armor class/i],
    ['hitPoints', { hitPoints: '0' }, /hit points/i],
    ['challengeRating', { challengeRating: 'boss' }, /challenge rating/i],
    ['ability score', { str: '99' }, /str/i],
    ['savingThrows', { savingThrows: 'str seven' }, /saving throws/i],
    ['action name', { actions: [{ name: '', description: 'hits' }] }, /action/i],
  ])('rejects invalid %s', (_label, override, message) => {
    const state = {
      ...emptyMonsterFormState(),
      name: 'Rat King',
      size: 'Medium',
      type: 'Beast',
      armorClass: '12',
      hitPoints: '20',
      speed: '20 ft.',
      challengeRating: '1/2',
      ...override,
    };

    const result = formStateToPayload(state);

    expect('error' in result).toBe(true);
    if ('error' in result) expect(result.error).toMatch(message);
  });
});
