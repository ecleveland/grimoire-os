import { describe, it, expect } from 'vitest';
import { ABILITY_NAMES, ARMOR_TYPES, SKILLS, SKILL_NAMES } from '@/lib/dnd-constants';
import { SKILL_ABILITY_MAP } from '@/app/characters/[id]/_components/utils';

// The sheet's SKILL_ABILITY_MAP is derived from SKILLS; this guards the single
// source of truth so a dropped/mistyped skill breaks CI loudly.
describe('dnd-constants', () => {
  it('has the full 18-skill list, each mapped to a valid ability', () => {
    expect(SKILLS).toHaveLength(18);
    for (const { name, ability } of SKILLS) {
      expect(name).toBeTruthy();
      expect(ABILITY_NAMES).toContain(ability);
    }
  });

  it('SKILL_NAMES mirrors SKILLS', () => {
    expect(SKILL_NAMES).toEqual(SKILLS.map(s => s.name));
  });

  it('the sheet SKILL_ABILITY_MAP is fully derived from SKILLS', () => {
    expect(Object.keys(SKILL_ABILITY_MAP)).toHaveLength(18);
    for (const { name, ability } of SKILLS) {
      expect(SKILL_ABILITY_MAP[name]).toBe(ability);
    }
  });

  it('exposes the four canonical armor categories', () => {
    expect(ARMOR_TYPES).toEqual(['Light', 'Medium', 'Heavy', 'Shields']);
  });
});
