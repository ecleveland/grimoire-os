import { describe, it, expect } from 'vitest';
import {
  abilityModifier,
  formatModifier,
  proficiencyBonus,
  passivePerception,
  skillBonus,
  SKILL_ABILITY_MAP,
  ABILITY_SKILLS_MAP,
} from '../utils';

describe('abilityModifier', () => {
  it.each([
    [1, -5],
    [8, -1],
    [10, 0],
    [11, 0],
    [14, 2],
    [15, 2],
    [20, 5],
    [30, 10],
  ])('score %i → modifier %i', (score, expected) => {
    expect(abilityModifier(score)).toBe(expected);
  });
});

describe('formatModifier', () => {
  it.each([
    [0, '+0'],
    [3, '+3'],
    [-1, '-1'],
    [5, '+5'],
    [-5, '-5'],
  ])('mod %i → "%s"', (mod, expected) => {
    expect(formatModifier(mod)).toBe(expected);
  });
});

describe('proficiencyBonus', () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ])('level %i → +%i', (level, expected) => {
    expect(proficiencyBonus(level)).toBe(expected);
  });
});

describe('passivePerception', () => {
  it('WIS 14, level 5, proficient → 15', () => {
    // wisMod(14) = 2, profBonus(5) = 3 → 10 + 2 + 3 = 15
    expect(passivePerception(14, 5, true)).toBe(15);
  });

  it('WIS 10, level 1, not proficient → 10', () => {
    // wisMod(10) = 0, no prof → 10 + 0 = 10
    expect(passivePerception(10, 1, false)).toBe(10);
  });

  it('WIS 16, level 9, proficient → 17', () => {
    // wisMod(16) = 3, profBonus(9) = 4 → 10 + 3 + 4 = 17
    expect(passivePerception(16, 9, true)).toBe(17);
  });
});

describe('skillBonus', () => {
  it('proficient: ability mod + proficiency bonus', () => {
    // abilityMod(14) = 2, profBonus(5) = 3 → 5
    expect(skillBonus(14, 5, true)).toBe(5);
  });

  it('not proficient: ability mod only', () => {
    // abilityMod(14) = 2 → 2
    expect(skillBonus(14, 5, false)).toBe(2);
  });

  it('low ability, not proficient: negative result', () => {
    // abilityMod(8) = -1 → -1
    expect(skillBonus(8, 1, false)).toBe(-1);
  });
});

describe('SKILL_ABILITY_MAP', () => {
  it('contains all 18 D&D 5e skills', () => {
    expect(Object.keys(SKILL_ABILITY_MAP)).toHaveLength(18);
  });

  it('maps Athletics to Strength', () => {
    expect(SKILL_ABILITY_MAP['Athletics']).toBe('Strength');
  });

  it('maps Stealth to Dexterity', () => {
    expect(SKILL_ABILITY_MAP['Stealth']).toBe('Dexterity');
  });

  it('maps Arcana to Intelligence', () => {
    expect(SKILL_ABILITY_MAP['Arcana']).toBe('Intelligence');
  });

  it('maps Perception to Wisdom', () => {
    expect(SKILL_ABILITY_MAP['Perception']).toBe('Wisdom');
  });

  it('maps Persuasion to Charisma', () => {
    expect(SKILL_ABILITY_MAP['Persuasion']).toBe('Charisma');
  });
});

describe('ABILITY_SKILLS_MAP', () => {
  it('contains 5 abilities (Constitution has no skills)', () => {
    expect(Object.keys(ABILITY_SKILLS_MAP)).toHaveLength(5);
    expect(ABILITY_SKILLS_MAP).not.toHaveProperty('Constitution');
  });

  it('Strength has Athletics', () => {
    expect(ABILITY_SKILLS_MAP['Strength']).toContain('Athletics');
  });

  it('Dexterity has Acrobatics, Sleight of Hand, Stealth', () => {
    expect(ABILITY_SKILLS_MAP['Dexterity']).toEqual(
      expect.arrayContaining(['Acrobatics', 'Sleight of Hand', 'Stealth'])
    );
  });

  it('Wisdom has 5 skills', () => {
    expect(ABILITY_SKILLS_MAP['Wisdom']).toHaveLength(5);
  });

  it('is the inverse of SKILL_ABILITY_MAP', () => {
    for (const [skill, ability] of Object.entries(SKILL_ABILITY_MAP)) {
      expect(ABILITY_SKILLS_MAP[ability]).toContain(skill);
    }
  });
});
