import { describe, it, expect } from 'vitest';
import { levelLabel, SPELL_LEVELS } from '../spell-constants';

describe('levelLabel', () => {
  it('labels level 0 as Cantrip', () => {
    expect(levelLabel(0)).toBe('Cantrip');
  });

  it('labels other levels as "Level N"', () => {
    expect(levelLabel(1)).toBe('Level 1');
    expect(levelLabel(9)).toBe('Level 9');
  });

  it('covers every entry of SPELL_LEVELS without throwing', () => {
    expect(SPELL_LEVELS.map(levelLabel)).toEqual([
      'Cantrip',
      'Level 1',
      'Level 2',
      'Level 3',
      'Level 4',
      'Level 5',
      'Level 6',
      'Level 7',
      'Level 8',
      'Level 9',
    ]);
  });
});
