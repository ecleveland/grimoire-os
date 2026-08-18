import type {
  AbilityScores,
  CarryingCapacityRule,
  ClassSpellcasting,
  ExhaustionRule,
  InventoryItem,
} from '@grimoire-os/shared';
import {
  CARRYING_CAPACITY_RULE,
  computeCoreCharacterStats,
  computeXpBand,
  DEFAULT_CHARACTER_STATS_RULES,
  EXHAUSTION_RULE,
  PROFICIENCY_BONUS_TABLE,
  proficiencyBonusFrom,
  SKILL_ABILITY_MAP,
  XP_LEVEL_THRESHOLDS,
} from '@grimoire-os/shared';
import { srdGameRules } from '../../seed/data/game-rules';
import { srdSkills } from '../../seed/data/skills';
import {
  abilityModifier,
  proficiencyBonus,
  computeCharacterStats,
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
    armorClass: null,
    proficiencies: [],
    inventory: [],
    weapons: [],
    exhaustion: null,
    speed: null,
    size: null,
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

describe('proficiency-bonus data', () => {
  it('the shared PROFICIENCY_BONUS_TABLE matches the seeded rule table (drift guard)', () => {
    // The compute layer reads the seeded rule while the builder previews and
    // test fixtures read the shared constant — this pin keeps them one table.
    const seeded = srdGameRules.find(r => r.category === 'proficiency-bonus' && r.key === 'table');
    expect(seeded?.value).toEqual(PROFICIENCY_BONUS_TABLE);
  });
});

describe('proficiencyBonusFrom', () => {
  it('throws on a table that does not cover the clamped level', () => {
    // A sparse table would otherwise surface as a silent NaN bonus downstream,
    // the same failure mode computeXpBand guards against.
    expect(() => proficiencyBonusFrom({ '1': 2 }, 5)).toThrow(/proficiency/i);
    expect(() => proficiencyBonusFrom({}, 1)).toThrow(/proficiency/i);
  });

  it('clamps out-of-range levels into the table rather than missing a row', () => {
    expect(proficiencyBonusFrom(PROFICIENCY_BONUS_TABLE, 0)).toBe(2);
    expect(proficiencyBonusFrom(PROFICIENCY_BONUS_TABLE, 25)).toBe(6);
    expect(proficiencyBonusFrom(PROFICIENCY_BONUS_TABLE, NaN)).toBe(2);
  });
});

// The shared core degrades rather than crashing on a rules table the seeded
// data would never produce (a homebrew/partial `game_rules` row). Only reachable
// by calling the core directly — `computeCharacterStats` always passes the
// seeded tables, so these paths are invisible from the entry point (VEG-453).
describe('computeCoreCharacterStats — rules-table degradation', () => {
  it('falls back to a bare 10 passive perception when the map has no Perception', () => {
    // Replaces a hard `skillBonuses['Perception'].bonus` deref that would have
    // thrown; the sheet must render a degenerate value, not a 500.
    const stats = computeCoreCharacterStats(
      { ...DEFAULT_CHARACTER_STATS_RULES, skillAbilityMap: {} },
      input()
    );
    expect(stats.passivePerception).toBe(10);
    expect(stats.skills).toEqual({});
  });

  it('scores a skill whose governing ability is unrecognized as modifier 0', () => {
    const stats = computeCoreCharacterStats(
      { ...DEFAULT_CHARACTER_STATS_RULES, skillAbilityMap: { Athletics: 'Luck' } },
      input()
    );
    // Strength is +3 here, so a 0 proves the unknown ability didn't resolve.
    expect(stats.skills['Athletics']).toEqual({
      ability: 'Luck',
      proficient: false,
      bonus: 0,
    });
  });

  it('still applies proficiency and exhaustion to an unrecognized-ability skill', () => {
    const stats = computeCoreCharacterStats(
      { ...DEFAULT_CHARACTER_STATS_RULES, skillAbilityMap: { Athletics: 'Luck' } },
      { ...input(), skills: ['Athletics'], exhaustion: 1 }
    );
    // 0 modifier + 3 proficiency - 2 exhaustion.
    expect(stats.skills['Athletics'].bonus).toBe(1);
  });
});

describe('skill→ability mapping data', () => {
  it('the shared SKILL_ABILITY_MAP matches the seeded rule, keys and order (drift guard)', () => {
    const seeded = srdGameRules.find(r => r.category === 'skills' && r.key === 'ability-mappings');
    expect(seeded?.value).toEqual(SKILL_ABILITY_MAP);
    // Key order drives the `computed.skills` insertion order the sheet renders,
    // so pin it too — toEqual alone would let a reordering through.
    expect(Object.keys(seeded?.value ?? {})).toEqual(Object.keys(SKILL_ABILITY_MAP));
  });

  it('the seeded srdSkills catalog agrees with the shared map', () => {
    // A fourth listing of skill→ability (with SRD descriptions). Same drift
    // risk as the rule table, so it gets pinned to the same master copy.
    expect(srdSkills).toHaveLength(Object.keys(SKILL_ABILITY_MAP).length);
    for (const { name, ability } of srdSkills) {
      expect(SKILL_ABILITY_MAP[name]).toBe(ability);
    }
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

// The XP band off the seeded threshold table, read through the real entry point
// (VEG-453 removed the standalone `computeXp` wrapper once the shared core
// started deriving the band itself).
function computeXp(level: number, experiencePoints: number) {
  return computeCharacterStats(input({ level, experiencePoints })).xp;
}

describe('xp band from the seeded threshold table', () => {
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

  // ── Equipment-derived AC & weapons (VEG-410) — the per-case math is covered
  // in gear.spec.ts; these pin the wiring: inventory + the stored armorClass
  // column flow into the derivation with the character's own Dex/prof inputs.
  describe('equipment-derived AC & weapons', () => {
    const chainShirt: InventoryItem = {
      name: 'Chain Shirt',
      quantity: 1,
      equipped: true,
      gear: { type: 'armor', armorType: 'medium', baseArmorClass: 13 },
    };
    const longsword: InventoryItem = {
      name: 'Longsword',
      quantity: 1,
      equipped: true,
      gear: {
        type: 'weapon',
        damage: '1d8',
        damageType: 'Slashing',
        properties: ['Versatile (1d10)'],
        ranged: false,
      },
    };

    it('derives AC from equipped armor using the character Dex modifier', () => {
      // Dex 12 → +1; medium 13 + 1 = 14, no shield.
      const stats = computeCharacterStats(input({ inventory: [chainShirt] }));
      expect(stats.armorClass).toEqual({
        derived: 14,
        override: null,
        effective: 14,
        breakdown: { base: 13, dexApplied: 1, shield: 0, armorType: 'medium' },
      });
    });

    it('falls back to unarmored 10 + Dex with an empty inventory', () => {
      const stats = computeCharacterStats(input());
      expect(stats.armorClass.derived).toBe(11);
      expect(stats.armorClass.breakdown.armorType).toBe('unarmored');
    });

    it('lets the stored armorClass column win as a manual override', () => {
      const stats = computeCharacterStats(input({ inventory: [chainShirt], armorClass: 18 }));
      expect(stats.armorClass).toMatchObject({ derived: 14, override: 18, effective: 18 });
    });

    it('derives weapon rows from equipped weapons using Str/prof', () => {
      // Str 16 → +3, level 5 → prof +3.
      const stats = computeCharacterStats(input({ inventory: [longsword] }));
      expect(stats.weapons).toEqual([
        {
          name: 'Longsword',
          attackBonus: '+6',
          damage: '1d8+3',
          damageType: 'Slashing',
          notes: 'Versatile (1d10)',
        },
      ]);
    });

    it('returns no weapon rows when nothing with weapon gear is equipped', () => {
      const stats = computeCharacterStats(input({ inventory: [chainShirt] }));
      expect(stats.weapons).toEqual([]);
    });

    it('omits derived rows shadowed by a stored manual weapon of the same name', () => {
      const stats = computeCharacterStats(
        input({
          inventory: [longsword],
          weapons: [
            { name: 'Longsword', attackBonus: '+7', damage: '1d8+4', damageType: 'Slashing' },
          ],
        })
      );
      expect(stats.weapons).toEqual([]);
    });

    // ── Weapon proficiency wiring (VEG-463) — match rules live in gear.spec;
    // these pin that grants reach the derivation from both inputs.
    const tieredLongsword: InventoryItem = {
      name: 'Longsword',
      quantity: 1,
      equipped: true,
      gear: {
        type: 'weapon',
        damage: '1d8',
        damageType: 'Slashing',
        properties: ['Versatile (1d10)'],
        ranged: false,
        weaponCategory: 'martial',
      },
    };

    it('derives a tiered weapon without the bonus when nothing grants it (VEG-463)', () => {
      const stats = computeCharacterStats(input({ inventory: [tieredLongsword] }));
      expect(stats.weapons[0]).toMatchObject({
        attackBonus: '+3',
        notes: 'Not proficient, Versatile (1d10)',
      });
    });

    it("resolves proficiency from the character's own proficiencies list (VEG-463)", () => {
      const stats = computeCharacterStats(
        input({ inventory: [tieredLongsword], proficiencies: ['Martial weapons'] })
      );
      expect(stats.weapons[0]).toMatchObject({ attackBonus: '+6', notes: 'Versatile (1d10)' });
    });

    it('unions class weapon proficiencies into the grants (VEG-463)', () => {
      const stats = computeCharacterStats(input({ inventory: [tieredLongsword] }), null, [
        'Simple weapons',
        'Longswords',
      ]);
      expect(stats.weapons[0]).toMatchObject({ attackBonus: '+6' });
    });
  });

  // ── Exhaustion (VEG-449) — SRD 5.2: every d20 Test reduced by 2 × level,
  // Speed by 5 ft × level, death at 6.
  describe('exhaustion penalties', () => {
    const dagger: InventoryItem = {
      name: 'Dagger',
      quantity: 1,
      equipped: true,
      gear: {
        type: 'weapon',
        damage: '1d4',
        damageType: 'Piercing',
        properties: [],
        ranged: false,
      },
    };

    it.each([null, 0])('leaves every derived value unpenalized at exhaustion %p', level => {
      const stats = computeCharacterStats(
        input({ exhaustion: level, savingThrows: ['Dexterity'], skills: ['Perception'] }),
        FULL_CASTER
      );
      expect(stats.exhaustion).toBeNull();
      // Dex 12 → +1, level 5 → prof +3.
      expect(stats.savingThrows['Dexterity'].bonus).toBe(4);
      expect(stats.skills['Perception'].bonus).toBe(4); // Wis 13 → +1, +3 prof
      expect(stats.initiative).toBe(1);
      expect(stats.passivePerception).toBe(14);
      expect(stats.speed).toEqual({
        base: 30,
        exhaustionPenalty: 0,
        encumbrancePenalty: 0,
        penalty: 0,
        effective: 30,
      });
    });

    it.each([
      [1, -2, 5],
      [2, -4, 10],
      [3, -6, 15],
      [4, -8, 20],
      [5, -10, 25],
    ])('level %i applies %i to d20 Tests and −%i ft Speed', (level, d20Penalty, speedPenalty) => {
      const stats = computeCharacterStats(
        input({ exhaustion: level, savingThrows: ['Dexterity'], skills: ['Perception'] }),
        FULL_CASTER
      );

      expect(stats.exhaustion).toEqual({ level, d20Penalty, speedPenalty, dead: false });
      // Each unexhausted baseline (asserted above) shifted by exactly the penalty
      // — once, never twice.
      expect(stats.savingThrows['Dexterity'].bonus).toBe(4 + d20Penalty);
      expect(stats.savingThrows['Strength'].bonus).toBe(3 + d20Penalty); // unproficient
      expect(stats.skills['Perception'].bonus).toBe(4 + d20Penalty);
      expect(stats.skills['Athletics'].bonus).toBe(3 + d20Penalty); // unproficient, Str +3
      expect(stats.initiative).toBe(1 + d20Penalty);
      expect(stats.passivePerception).toBe(14 + d20Penalty);
      expect(stats.spellcasting?.attackBonus).toBe(2 + d20Penalty); // Cha 8 → −1, +3 prof
      expect(stats.speed).toEqual({
        base: 30,
        exhaustionPenalty: speedPenalty,
        encumbrancePenalty: 0,
        penalty: speedPenalty,
        effective: 30 - speedPenalty,
      });
    });

    it('penalizes derived weapon attack rolls but not their damage', () => {
      // Str 16 → +3, prof +3, exhaustion 2 → −4.
      const stats = computeCharacterStats(input({ exhaustion: 2, inventory: [dagger] }));
      expect(stats.weapons[0]).toMatchObject({ attackBonus: '+2', damage: '1d4+3' });
    });

    it('penalizes surviving equipped rows when a manual row shadows another', () => {
      // The shadowing case is the one worth constructing: `deriveWeapons` only
      // ever returns rows built from `inventory`, so asserting on an empty
      // inventory would still pass with the d20Penalty parameter deleted. Here
      // the equipped Dagger is suppressed by the same-named manual row, and the
      // second equipped weapon proves the penalty reaches what survives.
      const club: InventoryItem = {
        name: 'Club',
        quantity: 1,
        equipped: true,
        gear: {
          type: 'weapon',
          damage: '1d4',
          damageType: 'Bludgeoning',
          properties: [],
          ranged: false,
        },
      };
      const stats = computeCharacterStats(
        input({
          exhaustion: 2,
          inventory: [dagger, club],
          weapons: [{ name: 'Dagger', attackBonus: '+7', damage: '1d4+4', damageType: 'Piercing' }],
        })
      );
      // Str 16 → +3, prof +3, exhaustion 2 → −4 ⇒ +2.
      expect(stats.weapons).toEqual([expect.objectContaining({ name: 'Club', attackBonus: '+2' })]);
    });

    it('never re-emits a stored manual row from the derived list', () => {
      // Manual rows are the player's own text and the compute layer must not
      // rewrite them. The sheet applies the penalty at render time instead
      // (WeaponsTable), so both row kinds agree within the one table.
      const manual = {
        name: 'Pact Blade',
        attackBonus: '+7',
        damage: '1d8+4',
        damageType: 'Force',
      };
      const stats = computeCharacterStats(input({ exhaustion: 5, weapons: [manual] }));
      expect(stats.weapons).toEqual([]);
      expect(manual.attackBonus).toBe('+7');
    });

    it('penalizes ability checks but not the raw ability modifiers', () => {
      const stats = computeCharacterStats(input({ exhaustion: 3 }));
      // Str 16 → +3 modifier, check at +3 − 6 = −3.
      expect(stats.abilityModifiers.strength).toBe(3);
      expect(stats.abilityChecks.strength).toBe(-3);
      // Cha 8 → −1 modifier, check at −7.
      expect(stats.abilityModifiers.charisma).toBe(-1);
      expect(stats.abilityChecks.charisma).toBe(-7);
    });

    it('leaves ability checks equal to the modifiers when unexhausted', () => {
      const stats = computeCharacterStats(input());
      expect(stats.abilityChecks).toEqual(stats.abilityModifiers);
    });

    it('leaves values that are not d20 Tests unchanged', () => {
      const base = computeCharacterStats(input({ inventory: [dagger] }), FULL_CASTER);
      const worn = computeCharacterStats(
        input({ exhaustion: 4, inventory: [dagger] }),
        FULL_CASTER
      );

      // The penalty applies to the roll, not the modifier — and the level-up /
      // short-rest HP math reads these modifiers for CON.
      expect(worn.abilityModifiers).toEqual(base.abilityModifiers);
      // A save DC is rolled against by the target, not rolled by the caster.
      expect(worn.spellcasting?.saveDC).toBe(base.spellcasting?.saveDC);
      expect(worn.spellcasting?.modifier).toBe(base.spellcasting?.modifier);
      expect(worn.armorClass).toEqual(base.armorClass);
      expect(worn.proficiencyBonus).toBe(base.proficiencyBonus);
      expect(worn.spellSlots).toEqual(base.spellSlots);
      expect(worn.xp).toEqual(base.xp);
    });

    it('flags death at level 6', () => {
      const stats = computeCharacterStats(input({ exhaustion: 6 }));
      expect(stats.exhaustion).toEqual({
        level: 6,
        d20Penalty: -12,
        speedPenalty: 30,
        dead: true,
      });
      // Advisory only: the block still computes, nothing auto-kills the row.
      expect(stats.savingThrows['Dexterity'].bonus).toBe(-11);
    });

    it('clamps levels past the rule maximum instead of scaling past death', () => {
      expect(computeCharacterStats(input({ exhaustion: 9 })).exhaustion).toEqual(
        computeCharacterStats(input({ exhaustion: 6 })).exhaustion
      );
    });

    it.each([-2, NaN, Infinity, 0.5])('treats %p as unexhausted', level => {
      expect(computeCharacterStats(input({ exhaustion: level })).exhaustion).toBeNull();
    });

    it('floors effective speed at zero rather than going negative', () => {
      // Base 20 ft, level 6 → −30 ft.
      const stats = computeCharacterStats(input({ exhaustion: 6, speed: 20 }));
      expect(stats.speed).toEqual({
        base: 20,
        exhaustionPenalty: 30,
        encumbrancePenalty: 0,
        penalty: 30,
        effective: 0,
      });
    });

    it('reports the stored speed column as the base, defaulting when absent', () => {
      expect(computeCharacterStats(input({ speed: 40 })).speed).toEqual({
        base: 40,
        exhaustionPenalty: 0,
        encumbrancePenalty: 0,
        penalty: 0,
        effective: 40,
      });
      expect(computeCharacterStats(input({ speed: null })).speed.base).toBe(30);
    });
  });
});

// VEG-490. Encumbrance was derived client-side in
// frontend/src/lib/character-inventory.ts and applied on top of computed.speed
// by InventorySection alone, so StatsBar's headline Speed stat silently omitted
// it. These cases move here with the derivation; the frontend specs they came
// from pinned every edge case below and none of that coverage is dropped.
describe('encumbrance (VEG-490)', () => {
  // Str 16 → capacity 240 lb, encumbered above 80, heavily encumbered above 160.
  const lbs = (weight: number) => [{ name: 'Load', quantity: 1, weight, equipped: false }];

  it('is unencumbered at or below Strength × 5, with no speed penalty', () => {
    const stats = computeCharacterStats(input({ inventory: lbs(80) }));
    expect(stats.encumbrance).toEqual({
      tier: 'unencumbered',
      speedPenalty: 0,
      hasDisadvantage: false,
      capacity: 240,
      carried: 80,
    });
    expect(stats.speed.encumbrancePenalty).toBe(0);
  });

  it('is encumbered above Strength × 5: −10 ft, no disadvantage', () => {
    const stats = computeCharacterStats(input({ inventory: lbs(81) }));
    expect(stats.encumbrance).toMatchObject({
      tier: 'encumbered',
      speedPenalty: 10,
      hasDisadvantage: false,
    });
    expect(stats.speed).toMatchObject({ encumbrancePenalty: 10, penalty: 10, effective: 20 });
  });

  it('is heavily encumbered above Strength × 10: −20 ft plus disadvantage', () => {
    const stats = computeCharacterStats(input({ inventory: lbs(161) }));
    expect(stats.encumbrance).toMatchObject({
      tier: 'heavily-encumbered',
      speedPenalty: 20,
      hasDisadvantage: true,
    });
    expect(stats.speed).toMatchObject({ encumbrancePenalty: 20, effective: 10 });
  });

  it('carries nothing, and is unencumbered, with an empty inventory', () => {
    const stats = computeCharacterStats(input({ inventory: [] }));
    expect(stats.encumbrance).toMatchObject({ tier: 'unencumbered', carried: 0, capacity: 240 });
  });

  it.each([
    ['Tiny', 0.5, 120],
    ['Small', 1, 240],
    ['Large', 2, 480],
    ['Huge', 4, 960],
    ['Gargantuan', 8, 1920],
  ])('scales capacity for a %s creature (×%p)', (size, _multiplier, capacity) => {
    expect(computeCharacterStats(input({ size })).encumbrance.capacity).toBe(capacity);
  });

  // The thresholds and the capacity scale by the same size multiplier.
  it('scales thresholds and capacity by creature size', () => {
    const large = computeCharacterStats(input({ inventory: lbs(160), size: 'Large' }));
    expect(large.encumbrance).toMatchObject({ tier: 'unencumbered', capacity: 480 });
    expect(
      computeCharacterStats(input({ inventory: lbs(161), size: 'Large' })).encumbrance.tier
    ).toBe('encumbered');
  });

  it.each([
    ['an unknown size', 'Weird'],
    ['an absent size', null],
  ])('falls back to the Medium multiplier for %s', (_label, size) => {
    const stats = computeCharacterStats(input({ inventory: lbs(81), size }));
    expect(stats.encumbrance).toMatchObject({ tier: 'encumbered', capacity: 240 });
  });

  it('sums weight × quantity, counting a missing weight as zero', () => {
    const stats = computeCharacterStats(
      input({
        inventory: [
          { name: 'Rations', quantity: 5, weight: 2, equipped: false },
          { name: 'Torch', quantity: 3, equipped: false },
        ],
      })
    );
    expect(stats.encumbrance.carried).toBe(10);
  });

  it('rounds carried weight to two decimals rather than showing float drift', () => {
    const stats = computeCharacterStats(
      input({ inventory: [{ name: 'Dart', quantity: 3, weight: 0.1, equipped: false }] })
    );
    expect(stats.encumbrance.carried).toBe(0.3);
  });

  // A minimal character (null abilityScores) must read as unencumbered rather
  // than spuriously over a capacity of 0 — the VEG-425 degrade-don't-crash rule,
  // and what InventorySection's DEFAULT_ABILITY_SCORES fallback did client-side.
  it('treats a character with no ability scores as unencumbered', () => {
    const stats = computeCharacterStats(input({ abilityScores: null, inventory: lbs(40) }));
    expect(stats.encumbrance).toMatchObject({ tier: 'unencumbered', speedPenalty: 0 });
    expect(stats.speed.encumbrancePenalty).toBe(0);
  });

  describe('stacked with exhaustion — the whole point of the ticket', () => {
    it('applies both reductions and keeps them separable in the breakdown', () => {
      // Base 30, exhaustion 2 → −10, heavily encumbered → −20.
      const stats = computeCharacterStats(input({ exhaustion: 2, inventory: lbs(161) }));
      expect(stats.speed).toEqual({
        base: 30,
        exhaustionPenalty: 10,
        encumbrancePenalty: 20,
        penalty: 30,
        effective: 0,
      });
    });

    it('floors at zero with both stacked, never reporting a negative speed', () => {
      // Base 30, exhaustion 5 → −25, heavily encumbered → −20; total −45.
      const stats = computeCharacterStats(input({ exhaustion: 5, inventory: lbs(200) }));
      expect(stats.speed.penalty).toBe(45);
      expect(stats.speed.effective).toBe(0);
    });

    it('reports one effective speed, so the stat bar and inventory readout agree', () => {
      const stats = computeCharacterStats(input({ exhaustion: 1, inventory: lbs(90), speed: 40 }));
      // 40 − 5 (exhaustion 1) − 10 (encumbered) = 25.
      expect(stats.speed.effective).toBe(25);
      expect(stats.speed.base - stats.speed.penalty).toBe(stats.speed.effective);
    });
  });
});

describe('carrying-capacity rule data', () => {
  it('the shared CARRYING_CAPACITY_RULE constant matches the seeded rule (drift guard)', () => {
    // Same arrangement as the exhaustion guard below: the compute layer reads the
    // seeded row while frontend fixtures read the shared constant, so this pins
    // them to one rule. The prose keys are display text the derivation never
    // reads, so they are not part of the contract.
    const seeded = srdGameRules.find(r => r.category === 'carrying-capacity' && r.key === 'rules');
    const {
      carryCapacity: _carryCapacity,
      pushDragLift: _pushDragLift,
      encumbrance: _encumbrance,
      ...numeric
    } = seeded!.value as unknown as CarryingCapacityRule & {
      carryCapacity: string;
      pushDragLift: string;
      encumbrance: Record<string, string>;
    };
    expect(numeric).toEqual(CARRYING_CAPACITY_RULE);
  });
});

describe('exhaustion rule data', () => {
  it('the shared EXHAUSTION_RULE constant matches the seeded rule (drift guard)', () => {
    // Frontend test fixtures derive computed.exhaustion from the shared constant
    // while the compute layer reads the seeded rule — this pin keeps them one
    // rule, exactly as the XP thresholds are pinned above. `effects` is display
    // prose the derivation never reads, so it isn't part of the contract.
    const seeded = srdGameRules.find(r => r.category === 'exhaustion' && r.key === 'levels');
    const { effects: _effects, ...numeric } = seeded!.value as unknown as ExhaustionRule & {
      effects: Record<string, string>;
    };
    expect(numeric).toEqual(EXHAUSTION_RULE);
  });

  it('the compute layer derives penalties from the rule, not hardcoded numbers', () => {
    const { maxLevel, d20PenaltyPerLevel, speedPenaltyFeetPerLevel } = EXHAUSTION_RULE;
    const stats = computeCharacterStats(input({ exhaustion: 3 }));
    expect(stats.exhaustion).toEqual({
      level: 3,
      d20Penalty: -(d20PenaltyPerLevel * 3),
      speedPenalty: speedPenaltyFeetPerLevel * 3,
      dead: 3 >= maxLevel,
    });
  });

  it('describes every level 1–6 in the display effects map', () => {
    const seeded = srdGameRules.find(r => r.category === 'exhaustion' && r.key === 'levels');
    const { effects } = seeded!.value as unknown as { effects: Record<string, string> };
    for (let level = 1; level <= 6; level++) {
      expect(effects[String(level)]).toEqual(expect.any(String));
      expect(effects[String(level)].length).toBeGreaterThan(0);
    }
    expect(effects['6']).toMatch(/death/i);
  });
});
