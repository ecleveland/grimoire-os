import { describe, it, expect } from 'vitest';
import { characterFeatureIdentity, featureRenderKey } from '@/lib/character-features';

describe('characterFeatureIdentity', () => {
  it('separates two grants of the same name and source at different levels', () => {
    const asi = { name: 'Ability Score Improvement', source: 'Fighter' };
    expect(characterFeatureIdentity({ ...asi, level: 4 })).not.toBe(
      characterFeatureIdentity({ ...asi, level: 8 })
    );
  });

  it('matches a re-offered grant at the level it was stored at (the revert guard)', () => {
    const stored = { name: 'Extra Attack', source: 'Fighter', level: 6 };
    const suggested = { name: 'Extra Attack', source: 'Fighter', level: 6 };
    expect(characterFeatureIdentity(stored)).toBe(characterFeatureIdentity(suggested));
  });

  it('ignores description — two edits of the same grant are one identity', () => {
    expect(characterFeatureIdentity({ name: 'Rage', source: 'Barbarian', description: 'A' })).toBe(
      characterFeatureIdentity({ name: 'Rage', source: 'Barbarian', description: 'B' })
    );
  });

  it('treats an absent level as distinct from level 1, not equal to it', () => {
    expect(characterFeatureIdentity({ name: 'Darkvision', source: 'Elf' })).not.toBe(
      characterFeatureIdentity({ name: 'Darkvision', source: 'Elf', level: 1 })
    );
  });

  it('cannot be forged by a name that contains the separator-adjacent text', () => {
    // ('a', 'b') and ('a b', undefined) must not collide the way a bare
    // concatenation would.
    expect(characterFeatureIdentity({ name: 'a', source: 'b' })).not.toBe(
      characterFeatureIdentity({ name: 'a b' })
    );
  });

  it('is case-sensitive and untrimmed, matching the stored text', () => {
    expect(characterFeatureIdentity({ name: 'Rage' })).not.toBe(
      characterFeatureIdentity({ name: 'rage' })
    );
    expect(characterFeatureIdentity({ name: 'Rage ' })).not.toBe(
      characterFeatureIdentity({ name: 'Rage' })
    );
  });
});

describe('featureRenderKey', () => {
  it('distinguishes two features a user hand-entered identically', () => {
    const dup = { name: 'Lucky', source: '' };
    expect(featureRenderKey(dup, 0)).not.toBe(featureRenderKey(dup, 1));
  });

  it('distinguishes the same name at two levels even at the same index', () => {
    const asi = { name: 'Ability Score Improvement', source: 'Fighter' };
    expect(featureRenderKey({ ...asi, level: 4 }, 0)).not.toBe(
      featureRenderKey({ ...asi, level: 8 }, 0)
    );
  });
});
