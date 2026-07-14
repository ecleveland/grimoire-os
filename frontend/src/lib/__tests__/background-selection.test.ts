import { describe, it, expect } from 'vitest';
import type { SrdBackground } from '@/lib/types';
import { resolveBackground, backgroundOptions } from '../background-selection';

function makeBackground(over: Partial<SrdBackground> = {}): SrdBackground {
  return {
    id: 'acolyte',
    name: 'Acolyte',
    contentSource: 'srd',
    skillProficiencies: ['Insight', 'Religion'],
    toolProficiencies: [],
    languages: 0,
    personalityTraits: [],
    ideals: [],
    bonds: [],
    flaws: [],
    source: 'SRD',
    ...over,
  };
}

describe('resolveBackground', () => {
  const srd = makeBackground({ id: 'acolyte', name: 'Acolyte', contentSource: 'srd' });
  const homebrew = makeBackground({
    id: 'bg-hb',
    name: 'Acolyte',
    contentSource: 'homebrew',
    skillProficiencies: ['Deception'],
  });
  // The homebrew duplicate sorts first — the exact array order that made the old
  // name-based `.find` return the wrong entry (VEG-473).
  const catalog = [homebrew, srd];

  it('resolves by id, ignoring an identically-named entry that sorts first', () => {
    expect(resolveBackground(catalog, { id: 'acolyte', name: 'Acolyte' })).toBe(srd);
    expect(resolveBackground(catalog, { id: 'bg-hb', name: 'Acolyte' })).toBe(homebrew);
  });

  it('falls back to name only when it is unambiguous (loaded/free-typed values)', () => {
    const unique = makeBackground({ id: 'sage', name: 'Sage', contentSource: 'srd' });
    expect(resolveBackground([...catalog, unique], { id: '', name: 'Sage' })).toBe(unique);
  });

  it('does NOT name-resolve a colliding name when no id is given', () => {
    // Two "Acolyte"s and no id can't be safely disambiguated, so resolve to nothing
    // rather than silently picking whichever sorts first and granting the wrong one.
    expect(resolveBackground(catalog, { id: '', name: 'Acolyte' })).toBeUndefined();
  });

  it('treats a case-variant duplicate as a collision (consistent with the dropdown labels)', () => {
    // backgroundOptions flags "Acolyte"/"acolyte" as colliding case-insensitively;
    // the name-fallback must agree, or it would silently resolve one and re-introduce
    // the wrong-tier grant the dropdown warned about.
    const lower = makeBackground({ id: 'bg-lower', name: 'acolyte', contentSource: 'homebrew' });
    expect(resolveBackground([srd, lower], { id: '', name: 'Acolyte' })).toBeUndefined();
  });

  it('returns undefined for an unknown id even when the name matches', () => {
    expect(resolveBackground(catalog, { id: 'missing', name: 'Acolyte' })).toBeUndefined();
  });

  it('returns undefined when neither id nor name resolves', () => {
    expect(resolveBackground(catalog, { id: '', name: 'Nonexistent' })).toBeUndefined();
    expect(resolveBackground(catalog, { id: '', name: '' })).toBeUndefined();
  });
});

describe('backgroundOptions', () => {
  it('leaves unique names undecorated (no label)', () => {
    const opts = backgroundOptions([
      makeBackground({ id: '1', name: 'Acolyte' }),
      makeBackground({ id: '2', name: 'Soldier' }),
    ]);
    expect(opts).toEqual([
      { id: '1', name: 'Acolyte' },
      { id: '2', name: 'Soldier' },
    ]);
  });

  it('suffixes every colliding entry with its content source', () => {
    const opts = backgroundOptions([
      makeBackground({ id: '1', name: 'Acolyte', contentSource: 'srd' }),
      makeBackground({ id: '2', name: 'Acolyte', contentSource: 'homebrew' }),
      makeBackground({ id: '3', name: 'Sailor', contentSource: 'srd' }),
    ]);
    expect(opts).toEqual([
      { id: '1', name: 'Acolyte', label: 'Acolyte (SRD)' },
      { id: '2', name: 'Acolyte', label: 'Acolyte (Homebrew)' },
      { id: '3', name: 'Sailor' },
    ]);
  });

  it('detects collisions case-insensitively and labels shared content', () => {
    const opts = backgroundOptions([
      makeBackground({ id: '1', name: 'Acolyte', contentSource: 'srd' }),
      makeBackground({ id: '2', name: 'acolyte', contentSource: 'shared' }),
    ]);
    expect(opts).toEqual([
      { id: '1', name: 'Acolyte', label: 'Acolyte (SRD)' },
      { id: '2', name: 'acolyte', label: 'acolyte (Shared)' },
    ]);
  });
});
