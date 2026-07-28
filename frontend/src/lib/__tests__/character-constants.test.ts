import { describe, it, expect } from 'vitest';
import { DIE_TYPES, SIZES } from '@/lib/types';
import { MONSTER_SIZES } from '@/lib/monster-constants';
import { DEFAULT_SPEED } from '@/lib/character-defaults';
// Value import from the shared package is fine in Vitest (it resolves the
// file:-linked workspace), unlike Turbopack at runtime — which is exactly why
// `DIE_TYPES` is mirrored locally in lib/types.ts. This guards that mirror.
import {
  DIE_TYPES as SHARED_DIE_TYPES,
  DEFAULT_SPEED as SHARED_DEFAULT_SPEED,
} from '@grimoire-os/shared';

describe('frontend constant mirrors stay in sync', () => {
  it('local DIE_TYPES matches the shared source of truth', () => {
    // The backend validates hit-die faces with `@IsIn(DIE_TYPES)` against the
    // shared list; a drift here would let the editor offer faces the API rejects
    // (or omit valid ones).
    expect([...DIE_TYPES]).toEqual([...SHARED_DIE_TYPES]);
  });

  it('local DEFAULT_SPEED matches the shared source of truth', () => {
    // The compute layer applies the shared constant to `computed.speed.base`
    // (VEG-449) while the inventory section's encumbrance readout still uses the
    // local mirror — a drift would have the two disagree about the same
    // character's walking speed.
    expect(DEFAULT_SPEED).toBe(SHARED_DEFAULT_SPEED);
  });

  it('SIZES matches the monster-form size vocabulary', () => {
    expect([...SIZES]).toEqual([...MONSTER_SIZES]);
  });
});
