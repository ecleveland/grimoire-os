import { resolveBackgroundRef } from './resolve-background';

type Row = { id: string; name: string; tier: string };

const pool: Row[] = [
  { id: 'srd-acolyte', name: 'Acolyte', tier: 'srd' },
  { id: 'shared-acolyte', name: 'Acolyte', tier: 'shared' },
  { id: 'srd-sage', name: 'Sage', tier: 'srd' },
];

describe('resolveBackgroundRef', () => {
  it('resolves by id when the id matches, ignoring a colliding name', () => {
    expect(resolveBackgroundRef(pool, { id: 'shared-acolyte', name: 'Acolyte' })?.tier).toBe(
      'shared'
    );
    expect(resolveBackgroundRef(pool, { id: 'srd-acolyte', name: 'Acolyte' })?.tier).toBe('srd');
  });

  it('resolves an unambiguous name when no id is supplied', () => {
    expect(resolveBackgroundRef(pool, { name: 'Sage' })?.id).toBe('srd-sage');
    expect(resolveBackgroundRef(pool, { id: null, name: 'Sage' })?.id).toBe('srd-sage');
  });

  it('returns undefined for a colliding name when no id disambiguates it', () => {
    expect(resolveBackgroundRef(pool, { name: 'Acolyte' })).toBeUndefined();
    expect(resolveBackgroundRef(pool, { id: '', name: 'Acolyte' })).toBeUndefined();
  });

  it('falls back to the unambiguous-name path when the id is stale/unknown', () => {
    expect(resolveBackgroundRef(pool, { id: 'deleted-row', name: 'Sage' })?.id).toBe('srd-sage');
    // Stale id + colliding name still refuses to guess a tier.
    expect(resolveBackgroundRef(pool, { id: 'deleted-row', name: 'Acolyte' })).toBeUndefined();
  });

  it('matches names case-insensitively for both resolution and collision detection', () => {
    expect(resolveBackgroundRef(pool, { name: 'sAgE' })?.id).toBe('srd-sage');
    // Case-variant of a colliding name is still treated as a collision.
    expect(resolveBackgroundRef(pool, { name: 'acolyte' })).toBeUndefined();
  });

  it('returns undefined for a name that matches no row', () => {
    expect(resolveBackgroundRef(pool, { name: 'Lighthouse Keeper' })).toBeUndefined();
  });
});
