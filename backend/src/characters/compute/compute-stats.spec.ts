import type { AbilityScores, ClassSpellcasting } from '@grimoire-os/shared';
import { computeXpBand, XP_LEVEL_THRESHOLDS } from '@grimoire-os/shared';
import { srdGameRules } from '../../seed/data/game-rules';
import {
  abilityModifier,
  proficiencyBonus,
  computeCharacterStats,
  computeXp,
  CharacterComputeInput,
} from './compute-stats';

const BASE_SCORES: AbilityScores = {
  strength: 16,
  dexterity: 12,
  constitution: 14,
  intelligence: 10,
  wisdom: 13,
  charisma: 8,
};

function input(over: Partial<CharacterComputeInput> = {}): CharacterComputeInput {
  return {
    level: 5,
    experiencePoints: 6500,
    abilityScores: BASE_SCORES,
    savingThrows: [],
    skills: [],
    spellcastingAbility: null,
    ...over,
  };
}

// Full caster: minimal progression with the level-5 row plus a level-20 row
// whose highest key is 9 (so the caster is classified "full").
const FULL_CASTER: ClassSpellcasting = {
  ability: 'Charisma',
  spellSlotProgression: {
    5: { 1: 4, 2: 3, 3: 2 },
    20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
  },
};

// Half caster: level-20 highest key is 5.
const HALF_CASTER: ClassSpellcasting = {
  ability: 'Wisdom',
  spellSlotProgression: {
    5: { 1: 4, 2: 2 },
    20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  },
};

const PACT_CASTER: ClassSpellcasting = {
  ability: 'Charisma',
  pactMagic: true,
  pactSlotProgression: {
    5: { slots: 2, slotLevel: 3 },
    20: { slots: 4, slotLevel: 5 },
  },
};

describe('abilityModifier', () => {
  it.each([
    [1, -5],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [16, 3],
    [20, 5],
    [30, 10],
  ])('score %i → modifier %i', (score, mod) => {
    expect(abilityModifier(score)).toBe(mod);
  });
});

describe('proficiencyBonus', () => {
  it.each([
    [1, 2],
    [4, 2],
    [5, 3],
    [9, 4],
    [13, 5],
    [17, 6],
    [20, 6],
  ])('level %i → +%i', (level, bonus) => {
    expect(proficiencyBonus(level)).toBe(bonus);
  });

  it('clamps levels outside 1–20', () => {
    expect(proficiencyBonus(0)).toBe(2);
    expect(proficiencyBonus(-3)).toBe(2);
    expect(proficiencyBonus(25)).toBe(6);
  });
});

describe('XP threshold data', () => {
  it('the shared XP_LEVEL_THRESHOLDS constant matches the seeded rule table (drift guard)', () => {
    // Frontend test fixtures derive computed.xp from the shared constant while
    // the compute layer reads the seeded rule — this pin keeps them one table.
    const seeded = srdGameRules.find(
      r => r.category === 'experience-points' && r.key === 'level-thresholds'
    );
    expect(seeded?.value).toEqual(XP_LEVEL_THRESHOLDS);
  });
});

describe('computeXpBand', () => {
  it('throws on a threshold table that does not cover the band', () => {
    expect(() => computeXpBand({ '1': 0 }, 1, 0)).toThrow(/threshold/i);
    expect(() => computeXpBand({}, 5, 6500)).toThrow(/threshold/i);
  });
});

describe('computeXp', () => {
  it('reports the band for a fresh level-1 character', () => {
    expect(computeXp(1, 0)).toEqual({
      currentLevelAt: 0,
      nextLevelAt: 300,
      into: 0,
      span: 300,
      readyToLevel: false,
    });
  });

  it('tracks progress within a band', () => {
    // Level 5 spans 6500–14000; 10250 is 3750 in.
    expect(computeXp(5, 10250)).toEqual({
      currentLevelAt: 6500,
      nextLevelAt: 14000,
      into: 3750,
      span: 7500,
      readyToLevel: false,
    });
  });

  it('flags readyToLevel exactly at the next threshold', () => {
    expect(computeXp(1, 300).readyToLevel).toBe(true);
    expect(computeXp(1, 299).readyToLevel).toBe(false);
  });

  it('keeps readyToLevel set when XP overshoots the next threshold', () => {
    const xp = computeXp(3, 14000); // enough for level 6 while still level 3
    expect(xp.readyToLevel).toBe(true);
    expect(xp.into).toBe(14000 - 900);
  });

  it('clamps `into` to zero when XP trails the current level (milestone leveling)', () => {
    expect(computeXp(5, 0).into).toBe(0);
  });

  it('has no next band at level 20', () => {
    expect(computeXp(20, 355000)).toEqual({
      currentLevelAt: 355000,
      nextLevelAt: null,
      into: 0,
      span: null,
      readyToLevel: false,
    });
  });

  it('clamps out-of-range levels like the other table lookups', () => {
    expect(computeXp(0, 0)).toEqual(computeXp(1, 0));
    expect(computeXp(25, 400000)).toEqual(computeXp(20, 400000));
  });
});

describe('computeCharacterStats', () => {
  it('includes the xp block derived from level and experiencePoints', () => {
    const stats = computeCharacterStats(input({ level: 5, experiencePoints: 6500 }));
    expect(stats.xp).toEqual({
      currentLevelAt: 6500,
      nextLevelAt: 14000,
      into: 0,
      span: 7500,
      readyToLevel: false,
    });
  });

  it('derives per-ability modifiers keyed like AbilityScores', () => {
    const { abilityModifiers } = computeCharacterStats(input());
    expect(abilityModifiers).toEqual({
      strength: 3,
      dexterity: 1,
      constitution: 2,
      intelligence: 0,
      wisdom: 1,
      charisma: -1,
    });
  });

  it('sets initiative to the Dexterity modifier', () => {
    expect(computeCharacterStats(input()).initiative).toBe(1);
    expect(
      computeCharacterStats(input({ abilityScores: { ...BASE_SCORES, dexterity: 18 } })).initiative
    ).toBe(4);
  });

  it('reports proficiency bonus for the level', () => {
    expect(computeCharacterStats(input({ level: 1 })).proficiencyBonus).toBe(2);
    expect(computeCharacterStats(input({ level: 5 })).proficiencyBonus).toBe(3);
    expect(computeCharacterStats(input({ level: 20 })).proficiencyBonus).toBe(6);
  });

  it('adds proficiency bonus only to proficient saving throws', () => {
    const { savingThrows } = computeCharacterStats(
      input({ savingThrows: ['Strength', 'Constitution'] })
    );
    // proficient: STR mod 3 + prof 3 = 6; CON mod 2 + prof 3 = 5
    expect(savingThrows['Strength']).toEqual({ bonus: 6, proficient: true });
    expect(savingThrows['Constitution']).toEqual({ bonus: 5, proficient: true });
    // not proficient: DEX mod 1, no bonus
    expect(savingThrows['Dexterity']).toEqual({ bonus: 1, proficient: false });
    expect(savingThrows['Charisma']).toEqual({ bonus: -1, proficient: false });
  });

  it('maps each skill to its governing ability and applies proficiency', () => {
    const { skills } = computeCharacterStats(input({ skills: ['Athletics', 'Intimidation'] }));
    // Athletics (Strength): mod 3 + prof 3 = 6
    expect(skills['Athletics']).toEqual({ ability: 'Strength', bonus: 6, proficient: true });
    // Intimidation (Charisma): mod -1 + prof 3 = 2
    expect(skills['Intimidation']).toEqual({ ability: 'Charisma', bonus: 2, proficient: true });
    // Stealth (Dexterity), not proficient: mod 1
    expect(skills['Stealth']).toEqual({ ability: 'Dexterity', bonus: 1, proficient: false });
    // Arcana (Intelligence), not proficient: mod 0
    expect(skills['Arcana']).toEqual({ ability: 'Intelligence', bonus: 0, proficient: false });
  });

  it('computes passive perception with and without Perception proficiency', () => {
    // WIS mod 1: 10 + 1 = 11 when not proficient
    expect(computeCharacterStats(input()).passivePerception).toBe(11);
    // proficient at level 5: 10 + 1 + 3 = 14
    expect(computeCharacterStats(input({ skills: ['Perception'] })).passivePerception).toBe(14);
  });

  it('leaves spellcasting null for a non-caster', () => {
    const stats = computeCharacterStats(input());
    expect(stats.spellcasting).toBeNull();
    expect(stats.spellSlots).toBeNull();
  });

  it('derives spell save DC and attack bonus from the class spellcasting ability', () => {
    // Charisma mod -1, prof 3 at level 5: DC = 8 + 3 + (-1) = 10; attack = 3 + (-1) = 2
    const stats = computeCharacterStats(input(), FULL_CASTER);
    expect(stats.spellcasting).toEqual({
      ability: 'Charisma',
      modifier: -1,
      saveDC: 10,
      attackBonus: 2,
    });
  });

  it('prefers an explicit spellcastingAbility column over the class default', () => {
    // Character column says Wisdom (mod 1) even though class is Charisma.
    const stats = computeCharacterStats(input({ spellcastingAbility: 'Wisdom' }), FULL_CASTER);
    expect(stats.spellcasting).toEqual({
      ability: 'Wisdom',
      modifier: 1,
      saveDC: 12,
      attackBonus: 4,
    });
  });

  it('computes with modifier 0 for an unrecognized spellcasting ability name', () => {
    // A corrupt/typo'd column still renders a caster block (the service logs it),
    // but the unknown ability contributes modifier 0: DC = 8 + 3 + 0 = 11.
    const stats = computeCharacterStats(input({ spellcastingAbility: 'Inteligence' }));
    expect(stats.spellcasting).toEqual({
      ability: 'Inteligence',
      modifier: 0,
      saveDC: 11,
      attackBonus: 3,
    });
  });

  it('exposes full-caster spell slot maxima at the character level', () => {
    const stats = computeCharacterStats(input({ level: 5 }), FULL_CASTER);
    expect(stats.spellSlots).toEqual({ caster: 'full', maxByLevel: { 1: 4, 2: 3, 3: 2 } });
  });

  it('classifies a half caster and its slot maxima', () => {
    const stats = computeCharacterStats(input({ level: 5 }), HALF_CASTER);
    expect(stats.spellSlots).toEqual({ caster: 'half', maxByLevel: { 1: 4, 2: 2 } });
  });

  it('classifies pact magic with a single slot tier', () => {
    const stats = computeCharacterStats(input({ level: 5 }), PACT_CASTER);
    expect(stats.spellSlots).toEqual({ caster: 'pact', maxByLevel: { 3: 2 } });
  });

  it('handles null ability scores by treating each as 10 (modifier 0)', () => {
    const stats = computeCharacterStats(input({ abilityScores: null }));
    expect(stats.abilityModifiers).toEqual({
      strength: 0,
      dexterity: 0,
      constitution: 0,
      intelligence: 0,
      wisdom: 0,
      charisma: 0,
    });
    expect(stats.initiative).toBe(0);
    expect(stats.passivePerception).toBe(10);
  });
});
