import { resolveByUniqueName, resolveCatalogRef } from './resolve-catalog-ref';

type Row = { id: string; name: string; tier: string };

const pool: Row[] = [
  { id: 'srd-acolyte', name: 'Acolyte', tier: 'srd' },
  { id: 'shared-acolyte', name: 'Acolyte', tier: 'shared' },
  { id: 'srd-sage', name: 'Sage', tier: 'srd' },
];

describe('resolveCatalogRef', () => {
  it('resolves by id when the id matches, ignoring a colliding name', () => {
    expect(resolveCatalogRef(pool, { id: 'shared-acolyte', name: 'Acolyte' })?.tier).toBe('shared');
    expect(resolveCatalogRef(pool, { id: 'srd-acolyte', name: 'Acolyte' })?.tier).toBe('srd');
  });

  it('resolves an unambiguous name when no id is supplied', () => {
    expect(resolveByUniqueName(pool, 'Sage')?.id).toBe('srd-sage');
    expect(resolveCatalogRef(pool, { id: null, name: 'Sage' })?.id).toBe('srd-sage');
  });

  it('returns undefined for a colliding name when no id disambiguates it', () => {
    expect(resolveByUniqueName(pool, 'Acolyte')).toBeUndefined();
    expect(resolveCatalogRef(pool, { id: '', name: 'Acolyte' })).toBeUndefined();
  });

  it('falls back to the unambiguous-name path when the id is stale/unknown', () => {
    expect(resolveCatalogRef(pool, { id: 'deleted-row', name: 'Sage' })?.id).toBe('srd-sage');
    // Stale id + colliding name still refuses to guess a tier.
    expect(resolveCatalogRef(pool, { id: 'deleted-row', name: 'Acolyte' })).toBeUndefined();
  });

  it('matches names case-insensitively for both resolution and collision detection', () => {
    expect(resolveByUniqueName(pool, 'sAgE')?.id).toBe('srd-sage');
    // Case-variant of a colliding name is still treated as a collision.
    expect(resolveByUniqueName(pool, 'acolyte')).toBeUndefined();
  });

  it('returns undefined for a name that matches no row', () => {
    expect(resolveByUniqueName(pool, 'Lighthouse Keeper')).toBeUndefined();
  });
});
