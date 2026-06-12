import { describe, it, expect } from 'vitest';
import { emptyItemFormState, itemToFormState, formStateToPayload } from '@/lib/item-form';
import type { SrdItem } from '@/lib/types';

const cloak: SrdItem = {
  id: 'hb-1',
  name: 'Cloak of Whispers',
  category: 'Wondrous Item',
  cost: '500 gp',
  weight: 2.5 as unknown as string,
  description: 'A cloak woven from twilight that muffles every footstep.',
  damage: '1d4',
  damageType: 'Psychic',
  armorClass: '12 + Dex modifier',
  stealthDisadvantage: true,
  strengthRequirement: 13,
  properties: ['Finesse', 'Light'],
  rarity: 'Rare',
  requiresAttunement: true,
  isMagic: true,
  source: 'Homebrew',
  contentSource: 'homebrew',
  createdById: 'u1',
};

describe('emptyItemFormState', () => {
  it('starts blank with all flags off', () => {
    expect(emptyItemFormState()).toEqual({
      name: '',
      category: '',
      rarity: '',
      cost: '',
      weight: '',
      damage: '',
      damageType: '',
      armorClass: '',
      strengthRequirement: '',
      properties: '',
      description: '',
      requiresAttunement: false,
      isMagic: false,
      stealthDisadvantage: false,
    });
  });
});

describe('itemToFormState', () => {
  it('maps an item onto editable strings, properties comma-separated', () => {
    expect(itemToFormState(cloak)).toEqual({
      name: 'Cloak of Whispers',
      category: 'Wondrous Item',
      rarity: 'Rare',
      cost: '500 gp',
      weight: '2.5',
      damage: '1d4',
      damageType: 'Psychic',
      armorClass: '12 + Dex modifier',
      strengthRequirement: '13',
      properties: 'Finesse, Light',
      description: 'A cloak woven from twilight that muffles every footstep.',
      requiresAttunement: true,
      isMagic: true,
      stealthDisadvantage: true,
    });
  });

  it('renders absent optional fields as empty strings', () => {
    const minimal: SrdItem = {
      id: 'i1',
      name: 'Rope',
      category: 'Adventuring Gear',
      properties: [],
      source: 'SRD 5.2.1',
      contentSource: 'srd',
    };
    expect(itemToFormState(minimal)).toEqual({
      name: 'Rope',
      category: 'Adventuring Gear',
      rarity: '',
      cost: '',
      weight: '',
      damage: '',
      damageType: '',
      armorClass: '',
      strengthRequirement: '',
      properties: '',
      description: '',
      requiresAttunement: false,
      isMagic: false,
      stealthDisadvantage: false,
    });
  });
});

describe('formStateToPayload', () => {
  function validState(over: Partial<ReturnType<typeof emptyItemFormState>> = {}) {
    return {
      ...emptyItemFormState(),
      name: 'Cloak of Whispers',
      category: 'Wondrous Item',
      ...over,
    };
  }

  it('builds a payload from a fully-populated state', () => {
    const result = formStateToPayload(
      validState({
        rarity: 'Rare',
        cost: ' 500 gp ',
        weight: '2.5',
        damage: '1d4',
        damageType: 'Psychic',
        armorClass: '12 + Dex modifier',
        strengthRequirement: '13',
        properties: ' Finesse , Light ,, ',
        description: ' A cloak. ',
        requiresAttunement: true,
        isMagic: true,
        stealthDisadvantage: true,
      })
    );

    expect(result).toEqual({
      payload: {
        name: 'Cloak of Whispers',
        category: 'Wondrous Item',
        rarity: 'Rare',
        cost: '500 gp',
        weight: 2.5,
        damage: '1d4',
        damageType: 'Psychic',
        armorClass: '12 + Dex modifier',
        strengthRequirement: 13,
        properties: ['Finesse', 'Light'],
        description: 'A cloak.',
        requiresAttunement: true,
        isMagic: true,
        stealthDisadvantage: true,
      },
    });
  });

  it('serializes cleared optional fields as null so a PATCH actually clears them (VEG-316)', () => {
    const result = formStateToPayload(validState());

    expect(result).toEqual({
      payload: expect.objectContaining({
        rarity: null,
        cost: null,
        weight: null,
        damage: null,
        damageType: null,
        armorClass: null,
        strengthRequirement: null,
        properties: null,
        description: null,
        requiresAttunement: false,
        isMagic: false,
        stealthDisadvantage: false,
      }),
    });
  });

  it('rejects a blank name', () => {
    expect(formStateToPayload(validState({ name: '   ' }))).toEqual({
      error: 'Name is required',
    });
  });

  it('rejects a blank category', () => {
    expect(formStateToPayload(validState({ category: '' }))).toEqual({
      error: 'Category is required',
    });
  });

  it.each(['abc', '-1'])('rejects invalid weight %j', weight => {
    expect(formStateToPayload(validState({ weight }))).toEqual({
      error: 'Weight must be a non-negative number',
    });
  });

  it.each(['abc', '-2', '1.5'])('rejects invalid strength requirement %j', strengthRequirement => {
    expect(formStateToPayload(validState({ strengthRequirement }))).toEqual({
      error: 'Strength requirement must be a non-negative whole number',
    });
  });

  it('accepts zero for weight and strength requirement', () => {
    const result = formStateToPayload(validState({ weight: '0', strengthRequirement: '0' }));
    expect(result).toEqual({
      payload: expect.objectContaining({ weight: 0, strengthRequirement: 0 }),
    });
  });

  it('trims the name', () => {
    const result = formStateToPayload(validState({ name: '  Rope  ' }));
    expect(result).toEqual({
      payload: expect.objectContaining({ name: 'Rope' }),
    });
  });
});
