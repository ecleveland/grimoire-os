import { describe, it, expect } from 'vitest';
import { SIZES } from '@/lib/types';
import { MONSTER_SIZES } from '@/lib/monster-constants';

describe('monster-constants', () => {
  it('SIZES matches the monster-form size vocabulary', () => {
    expect([...SIZES]).toEqual([...MONSTER_SIZES]);
  });
});
