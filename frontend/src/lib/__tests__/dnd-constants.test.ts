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

  it('lists the 18 skills grouped by ability, in display order (VEG-453)', () => {
    // SKILLS is derived from the shared master map rather than re-listing the
    // rows, so the builder preview can't drift from the seeded mappings the
    // backend computes against — a backend drift guard pins that master map to
    // the seeded `skills/ability-mappings` rule.
    //
    // Asserted against literals, not against `Object.entries(SHARED_…)`: SKILLS
    // *is* that expression, so comparing the two is an identity that cannot
    // fail. These literals are the actual pin on the grouped-by-ability order
    // the builder renders.
    expect(SKILLS.map(s => `${s.name}:${s.ability}`)).toEqual([
      'Athletics:Strength',
      'Acrobatics:Dexterity',
      'Sleight of Hand:Dexterity',
      'Stealth:Dexterity',
      'Arcana:Intelligence',
      'History:Intelligence',
      'Investigation:Intelligence',
      'Nature:Intelligence',
      'Religion:Intelligence',
      'Animal Handling:Wisdom',
      'Insight:Wisdom',
      'Medicine:Wisdom',
      'Perception:Wisdom',
      'Survival:Wisdom',
      'Deception:Charisma',
      'Intimidation:Charisma',
      'Performance:Charisma',
      'Persuasion:Charisma',
    ]);
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
