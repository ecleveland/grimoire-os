import { describe, it, expect } from 'vitest';
import type { SrdClass } from '@/lib/types';
import { resolveClass, classOptions } from '../class-selection';

function makeClass(over: Partial<SrdClass> = {}): SrdClass {
  return {
    id: 'fighter',
    name: 'Fighter',
    contentSource: 'srd',
    hitDie: 'd10',
    primaryAbilities: ['Strength'],
    savingThrows: ['Strength', 'Constitution'],
    armorProficiencies: ['Light armor'],
    weaponProficiencies: ['Simple weapons'],
    skillChoices: ['Athletics'],
    toolProficiencies: [],
    numSkillChoices: 2,
    features: [],
    source: 'SRD',
    ...over,
  };
}

describe('resolveClass', () => {
  const srd = makeClass({ id: 'fighter', name: 'Fighter', contentSource: 'srd', hitDie: 'd10' });
  const homebrew = makeClass({
    id: 'cls-hb',
    name: 'Fighter',
    contentSource: 'homebrew',
    hitDie: 'd12',
  });
  // The homebrew duplicate sorts first — the array order that made the old
  // name-based `.find` return the wrong row and seed the wrong hit die (VEG-524).
  const catalog = [homebrew, srd];

  it('resolves by id, ignoring an identically-named row that sorts first', () => {
    expect(resolveClass(catalog, { id: 'fighter', name: 'Fighter' })).toBe(srd);
    expect(resolveClass(catalog, { id: 'cls-hb', name: 'Fighter' })).toBe(homebrew);
  });

  it('falls back to name only when it is unambiguous (loaded/free-typed values)', () => {
    const unique = makeClass({ id: 'wizard', name: 'Wizard', contentSource: 'srd' });
    expect(resolveClass([...catalog, unique], { id: '', name: 'Wizard' })).toBe(unique);
  });

  // The safety property the whole fix rests on: with two "Fighter"s and no id
  // there is no correct answer, so it returns nothing rather than guessing. A
  // guess here would silently seed the wrong hit die into a permanent HP max.
  it('does NOT name-resolve a colliding name when no id is given', () => {
    expect(resolveClass(catalog, { id: '', name: 'Fighter' })).toBeUndefined();
  });

  // Homebrew classes are deletable, so a persisted id outlives its row.
  it('degrades a stale id to the unambiguous-name path, not to nothing', () => {
    const unique = makeClass({ id: 'wizard', name: 'Wizard', contentSource: 'srd' });
    expect(resolveClass([...catalog, unique], { id: 'cls-deleted', name: 'Wizard' })).toBe(unique);
  });

  it('resolves to nothing when a stale id meets a colliding name', () => {
    expect(resolveClass(catalog, { id: 'cls-deleted', name: 'Fighter' })).toBeUndefined();
  });

  // Matches classOptions' case-insensitive collision labelling, so a variant the
  // dropdown flags as colliding cannot slip through the guard here.
  it('treats a case-variant duplicate as a collision', () => {
    const variant = makeClass({ id: 'cls-lower', name: 'fighter', contentSource: 'homebrew' });
    expect(resolveClass([srd, variant], { id: '', name: 'Fighter' })).toBeUndefined();
  });

  it('resolves nothing for an empty name and no id', () => {
    expect(resolveClass(catalog, { id: '', name: '' })).toBeUndefined();
  });

  it('resolves nothing against an empty catalog', () => {
    expect(resolveClass([], { id: 'fighter', name: 'Fighter' })).toBeUndefined();
  });
});

describe('classOptions', () => {
  it('decorates only the colliding names with their source', () => {
    const srd = makeClass({ id: 'fighter', name: 'Fighter', contentSource: 'srd' });
    const homebrew = makeClass({ id: 'cls-hb', name: 'Fighter', contentSource: 'homebrew' });
    const unique = makeClass({ id: 'wizard', name: 'Wizard', contentSource: 'srd' });

    expect(classOptions([srd, homebrew, unique])).toEqual([
      { id: 'fighter', name: 'Fighter', label: 'Fighter (SRD)' },
      { id: 'cls-hb', name: 'Fighter', label: 'Fighter (Homebrew)' },
      // Unique names render undecorated — the overwhelming common case.
      { id: 'wizard', name: 'Wizard' },
    ]);
  });

  it('labels a shared-tier collision', () => {
    const srd = makeClass({ id: 'fighter', name: 'Fighter', contentSource: 'srd' });
    const shared = makeClass({ id: 'cls-sh', name: 'Fighter', contentSource: 'shared' });

    expect(classOptions([srd, shared]).map(o => o.label)).toEqual([
      'Fighter (SRD)',
      'Fighter (Shared)',
    ]);
  });

  it('decorates case-variant collisions too', () => {
    const srd = makeClass({ id: 'fighter', name: 'Fighter', contentSource: 'srd' });
    const variant = makeClass({ id: 'cls-hb', name: 'fighter', contentSource: 'homebrew' });

    expect(classOptions([srd, variant]).map(o => o.label)).toEqual([
      'Fighter (SRD)',
      'fighter (Homebrew)',
    ]);
  });

  // The committed value stays the bare name so filtering, exact-match and the
  // persisted `class` string are unaffected by the decoration.
  it('leaves the committed name undecorated', () => {
    const srd = makeClass({ id: 'fighter', name: 'Fighter', contentSource: 'srd' });
    const homebrew = makeClass({ id: 'cls-hb', name: 'Fighter', contentSource: 'homebrew' });

    expect(classOptions([srd, homebrew]).map(o => o.name)).toEqual(['Fighter', 'Fighter']);
  });

  it('returns an empty list for an empty catalog', () => {
    expect(classOptions([])).toEqual([]);
  });
});
