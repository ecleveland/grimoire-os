import { srdGameRules } from './game-rules';

function getRule(category: string, key: string) {
  return srdGameRules.find(r => r.category === category && r.key === key);
}

function getTable(category: string, key: string): Record<string, number> {
  const rule = getRule(category, key);
  if (!rule) throw new Error(`Missing game rule ${category}/${key}`);
  return rule.value as unknown as Record<string, number>;
}

describe('SRD game rules seed data', () => {
  describe('uniqueness', () => {
    it('has a unique (category, key) for every entry', () => {
      const seen = new Set<string>();
      for (const rule of srdGameRules) {
        const id = `${rule.category}::${rule.key}`;
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    });
  });

  describe('ability-scores / modifier-formula', () => {
    it('exists', () => {
      expect(getRule('ability-scores', 'modifier-formula')).toBeDefined();
    });

    it('encodes the SRD formula and a human description', () => {
      const rule = getRule('ability-scores', 'modifier-formula')!;
      expect(rule.value).toEqual({
        formula: 'floor((score - 10) / 2)',
        description: expect.stringMatching(/score|modifier/i),
      });
    });
  });

  describe('ability-scores / modifier-table', () => {
    it('exists', () => {
      expect(getRule('ability-scores', 'modifier-table')).toBeDefined();
    });

    it('covers ability scores 1 through 30', () => {
      const table = getTable('ability-scores', 'modifier-table');
      for (let score = 1; score <= 30; score++) {
        expect(table[String(score)]).toBeDefined();
      }
    });

    it('matches floor((score - 10) / 2) for every entry', () => {
      const table = getTable('ability-scores', 'modifier-table');
      for (let score = 1; score <= 30; score++) {
        expect(table[String(score)]).toBe(Math.floor((score - 10) / 2));
      }
    });

    it('has the expected boundary values', () => {
      const table = getTable('ability-scores', 'modifier-table');
      expect(table['1']).toBe(-5);
      expect(table['10']).toBe(0);
      expect(table['11']).toBe(0);
      expect(table['20']).toBe(5);
      expect(table['30']).toBe(10);
    });
  });

  describe('skills / ability-mappings', () => {
    it('exists', () => {
      expect(getRule('skills', 'ability-mappings')).toBeDefined();
    });

    it('maps each of the 18 SRD skills to its governing ability', () => {
      const rule = getRule('skills', 'ability-mappings')!;
      expect(rule.value).toEqual({
        Athletics: 'Strength',
        Acrobatics: 'Dexterity',
        'Sleight of Hand': 'Dexterity',
        Stealth: 'Dexterity',
        Arcana: 'Intelligence',
        History: 'Intelligence',
        Investigation: 'Intelligence',
        Nature: 'Intelligence',
        Religion: 'Intelligence',
        'Animal Handling': 'Wisdom',
        Insight: 'Wisdom',
        Medicine: 'Wisdom',
        Perception: 'Wisdom',
        Survival: 'Wisdom',
        Deception: 'Charisma',
        Intimidation: 'Charisma',
        Performance: 'Charisma',
        Persuasion: 'Charisma',
      });
    });

    it('uses only the six SRD abilities as values', () => {
      const mappings = getRule('skills', 'ability-mappings')!.value as unknown as Record<
        string,
        string
      >;
      const validAbilities = new Set([
        'Strength',
        'Dexterity',
        'Constitution',
        'Intelligence',
        'Wisdom',
        'Charisma',
      ]);
      for (const ability of Object.values(mappings)) {
        expect(validAbilities.has(ability)).toBe(true);
      }
    });
  });

  describe('skills / bonus-formula', () => {
    it('exists', () => {
      expect(getRule('skills', 'bonus-formula')).toBeDefined();
    });

    it('encodes the skill check bonus formula and a description', () => {
      const rule = getRule('skills', 'bonus-formula')!;
      expect(rule.value).toEqual({
        formula: 'ability_modifier + (isProficient ? proficiency_bonus : 0)',
        description: expect.stringMatching(/skill|proficien/i),
      });
    });
  });

  describe('skills / passive-check-formula', () => {
    it('exists', () => {
      expect(getRule('skills', 'passive-check-formula')).toBeDefined();
    });

    it('encodes the passive check formula and a description', () => {
      const rule = getRule('skills', 'passive-check-formula')!;
      expect(rule.value).toEqual({
        formula: '10 + ability_modifier + (isProficient ? proficiency_bonus : 0)',
        description: expect.stringMatching(/passive|10/i),
      });
    });
  });

  describe('spell-slots / full-caster', () => {
    it('exists', () => {
      expect(getRule('spell-slots', 'full-caster')).toBeDefined();
    });

    it('covers character levels 1 through 20', () => {
      const rule = getRule('spell-slots', 'full-caster')!;
      const table = rule.value as unknown as Record<string, Record<string, number>>;
      for (let level = 1; level <= 20; level++) {
        expect(table[String(level)]).toBeDefined();
      }
    });

    it('matches the SRD full caster progression at key boundaries', () => {
      const table = getRule('spell-slots', 'full-caster')!.value as unknown as Record<
        string,
        Record<string, number>
      >;
      expect(table['1']).toEqual({ '1': 2 });
      expect(table['3']).toEqual({ '1': 4, '2': 2 });
      expect(table['5']).toEqual({ '1': 4, '2': 3, '3': 2 });
      expect(table['9']).toEqual({ '1': 4, '2': 3, '3': 3, '4': 3, '5': 1 });
      expect(table['17']).toEqual({
        '1': 4,
        '2': 3,
        '3': 3,
        '4': 3,
        '5': 2,
        '6': 1,
        '7': 1,
        '8': 1,
        '9': 1,
      });
      expect(table['20']).toEqual({
        '1': 4,
        '2': 3,
        '3': 3,
        '4': 3,
        '5': 3,
        '6': 2,
        '7': 2,
        '8': 1,
        '9': 1,
      });
    });

    it('reaches a 9th-level slot starting at character level 17', () => {
      const table = getRule('spell-slots', 'full-caster')!.value as unknown as Record<
        string,
        Record<string, number>
      >;
      for (let level = 1; level <= 16; level++) {
        expect(table[String(level)]['9']).toBeUndefined();
      }
      for (let level = 17; level <= 20; level++) {
        expect(table[String(level)]['9']).toBe(1);
      }
    });
  });

  describe('spell-slots / half-caster', () => {
    it('exists', () => {
      expect(getRule('spell-slots', 'half-caster')).toBeDefined();
    });

    it('covers character levels 1 through 20', () => {
      const table = getRule('spell-slots', 'half-caster')!.value as unknown as Record<
        string,
        Record<string, number>
      >;
      for (let level = 1; level <= 20; level++) {
        expect(table[String(level)]).toBeDefined();
      }
    });

    it('has no spell slots at character level 1', () => {
      const table = getRule('spell-slots', 'half-caster')!.value as unknown as Record<
        string,
        Record<string, number>
      >;
      expect(table['1']).toEqual({});
    });

    it('matches the SRD half caster progression at key boundaries', () => {
      const table = getRule('spell-slots', 'half-caster')!.value as unknown as Record<
        string,
        Record<string, number>
      >;
      expect(table['2']).toEqual({ '1': 2 });
      expect(table['5']).toEqual({ '1': 4, '2': 2 });
      expect(table['9']).toEqual({ '1': 4, '2': 3, '3': 2 });
      expect(table['13']).toEqual({ '1': 4, '2': 3, '3': 3, '4': 1 });
      expect(table['17']).toEqual({ '1': 4, '2': 3, '3': 3, '4': 3, '5': 1 });
      expect(table['20']).toEqual({ '1': 4, '2': 3, '3': 3, '4': 3, '5': 2 });
    });

    it('caps slot levels at 5 (no slots above 5th)', () => {
      const table = getRule('spell-slots', 'half-caster')!.value as unknown as Record<
        string,
        Record<string, number>
      >;
      for (let level = 1; level <= 20; level++) {
        for (const slotLevel of Object.keys(table[String(level)])) {
          expect(Number(slotLevel)).toBeLessThanOrEqual(5);
        }
      }
    });
  });

  describe('spell-slots / pact-magic', () => {
    it('exists', () => {
      expect(getRule('spell-slots', 'pact-magic')).toBeDefined();
    });

    it('covers character levels 1 through 20 with { slots, slotLevel } shape', () => {
      const table = getRule('spell-slots', 'pact-magic')!.value as unknown as Record<
        string,
        { slots: number; slotLevel: number }
      >;
      for (let level = 1; level <= 20; level++) {
        const entry = table[String(level)];
        expect(entry).toBeDefined();
        expect(typeof entry.slots).toBe('number');
        expect(typeof entry.slotLevel).toBe('number');
      }
    });

    it('matches the SRD Pact Magic progression at key boundaries', () => {
      const table = getRule('spell-slots', 'pact-magic')!.value as unknown as Record<
        string,
        { slots: number; slotLevel: number }
      >;
      expect(table['1']).toEqual({ slots: 1, slotLevel: 1 });
      expect(table['2']).toEqual({ slots: 2, slotLevel: 1 });
      expect(table['3']).toEqual({ slots: 2, slotLevel: 2 });
      expect(table['5']).toEqual({ slots: 2, slotLevel: 3 });
      expect(table['9']).toEqual({ slots: 2, slotLevel: 5 });
      expect(table['11']).toEqual({ slots: 3, slotLevel: 5 });
      expect(table['17']).toEqual({ slots: 4, slotLevel: 5 });
      expect(table['20']).toEqual({ slots: 4, slotLevel: 5 });
    });

    it('caps slot level at 5', () => {
      const table = getRule('spell-slots', 'pact-magic')!.value as unknown as Record<
        string,
        { slots: number; slotLevel: number }
      >;
      for (let level = 1; level <= 20; level++) {
        expect(table[String(level)].slotLevel).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('spell-slots / multiclass-table', () => {
    it('exists', () => {
      expect(getRule('spell-slots', 'multiclass-table')).toBeDefined();
    });

    it('covers combined caster levels 1 through 20', () => {
      const table = getRule('spell-slots', 'multiclass-table')!.value as unknown as Record<
        string,
        Record<string, number>
      >;
      for (let level = 1; level <= 20; level++) {
        expect(table[String(level)]).toBeDefined();
      }
    });

    it('matches the SRD multiclass spellcaster table (identical to full caster progression)', () => {
      const multiclass = getRule('spell-slots', 'multiclass-table')!.value as unknown as Record<
        string,
        Record<string, number>
      >;
      const fullCaster = getRule('spell-slots', 'full-caster')!.value as unknown as Record<
        string,
        Record<string, number>
      >;
      expect(multiclass).toEqual(fullCaster);
    });
  });

  describe.each([
    ['pattern-2-3-4', 2, 3, 4],
    ['pattern-3-4-5', 3, 4, 5],
    ['pattern-4-5-6', 4, 5, 6],
  ])('cantrips-known / %s', (key, base, atL4, atL10) => {
    it('exists', () => {
      expect(getRule('cantrips-known', key)).toBeDefined();
    });

    it('covers character levels 1 through 20', () => {
      const table = getTable('cantrips-known', key);
      for (let level = 1; level <= 20; level++) {
        expect(table[String(level)]).toBeDefined();
      }
    });

    it('steps from base at L1 → +1 at L4 → +2 at L10', () => {
      const table = getTable('cantrips-known', key);
      expect(table['1']).toBe(base);
      expect(table['3']).toBe(base);
      expect(table['4']).toBe(atL4);
      expect(table['9']).toBe(atL4);
      expect(table['10']).toBe(atL10);
      expect(table['20']).toBe(atL10);
    });

    it('is monotonically non-decreasing', () => {
      const table = getTable('cantrips-known', key);
      for (let level = 2; level <= 20; level++) {
        expect(table[String(level)]).toBeGreaterThanOrEqual(table[String(level - 1)]);
      }
    });
  });

  describe('spells-known / bard', () => {
    it('exists', () => {
      expect(getRule('spells-known', 'bard')).toBeDefined();
    });

    it('covers character levels 1 through 20', () => {
      const table = getTable('spells-known', 'bard');
      for (let level = 1; level <= 20; level++) {
        expect(table[String(level)]).toBeDefined();
      }
    });

    it('matches the SRD bard spells-known progression including Magical Secrets bumps', () => {
      const table = getTable('spells-known', 'bard');
      expect(table['1']).toBe(4);
      expect(table['2']).toBe(5);
      expect(table['9']).toBe(12);
      expect(table['10']).toBe(14);
      expect(table['13']).toBe(16);
      expect(table['14']).toBe(18);
      expect(table['17']).toBe(20);
      expect(table['18']).toBe(22);
      expect(table['20']).toBe(22);
    });

    it('is monotonically non-decreasing', () => {
      const table = getTable('spells-known', 'bard');
      for (let level = 2; level <= 20; level++) {
        expect(table[String(level)]).toBeGreaterThanOrEqual(table[String(level - 1)]);
      }
    });
  });

  describe('spells-known / ranger', () => {
    it('exists', () => {
      expect(getRule('spells-known', 'ranger')).toBeDefined();
    });

    it('covers character levels 1 through 20', () => {
      const table = getTable('spells-known', 'ranger');
      for (let level = 1; level <= 20; level++) {
        expect(table[String(level)]).toBeDefined();
      }
    });

    it('has zero spells known at level 1 (ranger gains spellcasting at level 2)', () => {
      const table = getTable('spells-known', 'ranger');
      expect(table['1']).toBe(0);
      expect(table['2']).toBe(2);
    });

    it('matches the SRD ranger progression at key boundaries', () => {
      const table = getTable('spells-known', 'ranger');
      expect(table['5']).toBe(4);
      expect(table['9']).toBe(6);
      expect(table['13']).toBe(8);
      expect(table['17']).toBe(10);
      expect(table['20']).toBe(11);
    });

    it('is monotonically non-decreasing', () => {
      const table = getTable('spells-known', 'ranger');
      for (let level = 2; level <= 20; level++) {
        expect(table[String(level)]).toBeGreaterThanOrEqual(table[String(level - 1)]);
      }
    });
  });

  describe('spells-known / sorcerer', () => {
    it('exists', () => {
      expect(getRule('spells-known', 'sorcerer')).toBeDefined();
    });

    it('covers character levels 1 through 20', () => {
      const table = getTable('spells-known', 'sorcerer');
      for (let level = 1; level <= 20; level++) {
        expect(table[String(level)]).toBeDefined();
      }
    });

    it('matches the SRD sorcerer progression at key boundaries', () => {
      const table = getTable('spells-known', 'sorcerer');
      expect(table['1']).toBe(2);
      expect(table['2']).toBe(3);
      expect(table['9']).toBe(10);
      expect(table['11']).toBe(12);
      expect(table['15']).toBe(14);
      expect(table['17']).toBe(15);
      expect(table['20']).toBe(15);
    });

    it('is monotonically non-decreasing', () => {
      const table = getTable('spells-known', 'sorcerer');
      for (let level = 2; level <= 20; level++) {
        expect(table[String(level)]).toBeGreaterThanOrEqual(table[String(level - 1)]);
      }
    });
  });

  describe('spells-known / warlock', () => {
    it('exists', () => {
      expect(getRule('spells-known', 'warlock')).toBeDefined();
    });

    it('covers character levels 1 through 20', () => {
      const table = getTable('spells-known', 'warlock');
      for (let level = 1; level <= 20; level++) {
        expect(table[String(level)]).toBeDefined();
      }
    });

    it('matches the SRD warlock progression at key boundaries', () => {
      const table = getTable('spells-known', 'warlock');
      expect(table['1']).toBe(2);
      expect(table['2']).toBe(3);
      expect(table['9']).toBe(10);
      expect(table['10']).toBe(10);
      expect(table['11']).toBe(11);
      expect(table['17']).toBe(14);
      expect(table['19']).toBe(15);
      expect(table['20']).toBe(15);
    });

    it('is monotonically non-decreasing', () => {
      const table = getTable('spells-known', 'warlock');
      for (let level = 2; level <= 20; level++) {
        expect(table[String(level)]).toBeGreaterThanOrEqual(table[String(level - 1)]);
      }
    });
  });

  describe('experience-points / level-thresholds', () => {
    it('exists', () => {
      expect(getRule('experience-points', 'level-thresholds')).toBeDefined();
    });

    it('covers character levels 1 through 20', () => {
      const table = getTable('experience-points', 'level-thresholds');
      for (let level = 1; level <= 20; level++) {
        expect(table[String(level)]).toBeDefined();
      }
    });

    it('starts at 0 XP for level 1', () => {
      const table = getTable('experience-points', 'level-thresholds');
      expect(table['1']).toBe(0);
    });

    it('matches the SRD XP-by-level thresholds at key boundaries', () => {
      const table = getTable('experience-points', 'level-thresholds');
      expect(table['2']).toBe(300);
      expect(table['3']).toBe(900);
      expect(table['5']).toBe(6500);
      expect(table['10']).toBe(64000);
      expect(table['15']).toBe(165000);
      expect(table['20']).toBe(355000);
    });

    it('is strictly increasing from level 2 onward', () => {
      const table = getTable('experience-points', 'level-thresholds');
      for (let level = 2; level <= 20; level++) {
        expect(table[String(level)]).toBeGreaterThan(table[String(level - 1)]);
      }
    });
  });

  describe('experience-points / encounter-difficulty', () => {
    type EncounterDifficulty = {
      description: string;
      thresholds: Record<string, { easy: number; medium: number; hard: number; deadly: number }>;
    };

    function getEncounterDifficulty(): EncounterDifficulty {
      return getRule('experience-points', 'encounter-difficulty')!
        .value as unknown as EncounterDifficulty;
    }

    it('exists', () => {
      expect(getRule('experience-points', 'encounter-difficulty')).toBeDefined();
    });

    it('has a description and a thresholds map', () => {
      const value = getEncounterDifficulty();
      expect(typeof value.description).toBe('string');
      expect(value.description.length).toBeGreaterThan(0);
      expect(typeof value.thresholds).toBe('object');
    });

    it('covers character levels 1 through 20 with all four difficulty ratings', () => {
      const { thresholds } = getEncounterDifficulty();
      for (let level = 1; level <= 20; level++) {
        const entry = thresholds[String(level)];
        expect(entry).toBeDefined();
        expect(typeof entry.easy).toBe('number');
        expect(typeof entry.medium).toBe('number');
        expect(typeof entry.hard).toBe('number');
        expect(typeof entry.deadly).toBe('number');
      }
    });

    it('matches the SRD encounter difficulty thresholds at key boundaries', () => {
      const { thresholds } = getEncounterDifficulty();
      expect(thresholds['1']).toEqual({ easy: 25, medium: 50, hard: 75, deadly: 100 });
      expect(thresholds['2']).toEqual({ easy: 50, medium: 100, hard: 150, deadly: 200 });
      expect(thresholds['5']).toEqual({ easy: 250, medium: 500, hard: 750, deadly: 1100 });
      expect(thresholds['10']).toEqual({ easy: 600, medium: 1200, hard: 1900, deadly: 2800 });
      expect(thresholds['20']).toEqual({ easy: 2800, medium: 5700, hard: 8500, deadly: 12700 });
    });

    it('orders ratings within each level: easy < medium < hard < deadly', () => {
      const { thresholds } = getEncounterDifficulty();
      for (let level = 1; level <= 20; level++) {
        const t = thresholds[String(level)];
        expect(t.easy).toBeLessThan(t.medium);
        expect(t.medium).toBeLessThan(t.hard);
        expect(t.hard).toBeLessThan(t.deadly);
      }
    });
  });

  describe('resting / short-rest', () => {
    it('exists', () => {
      expect(getRule('resting', 'short-rest')).toBeDefined();
    });

    it('matches the SRD short-rest fields', () => {
      const rule = getRule('resting', 'short-rest')!;
      expect(rule.value).toEqual({
        duration: 'At least 1 hour',
        hitDiceRecovery:
          'Spend one or more Hit Dice to regain hit points (roll die + CON modifier per die spent)',
        description:
          'A period of downtime, at least 1 hour long, during which a character does nothing more strenuous than eating, drinking, reading, and tending to wounds',
      });
    });
  });

  describe('resting / long-rest', () => {
    it('exists', () => {
      expect(getRule('resting', 'long-rest')).toBeDefined();
    });

    it('matches the SRD long-rest fields', () => {
      const rule = getRule('resting', 'long-rest')!;
      expect(rule.value).toEqual({
        duration: 'At least 8 hours (6 sleeping, 2 light activity)',
        hpRecovery: 'Regain all lost hit points',
        hitDiceRecovery: 'Regain spent Hit Dice up to half total (minimum 1)',
        spellSlotRecovery: 'Regain all expended spell slots',
        exhaustionRecovery: 'Reduce exhaustion level by 1 (if fed)',
        frequency: 'Once per 24-hour period',
        description: 'A period of extended downtime, at least 8 hours long',
      });
    });
  });

  describe('exhaustion / levels', () => {
    it('exists', () => {
      expect(getRule('exhaustion', 'levels')).toBeDefined();
    });

    it('covers exhaustion levels 1 through 6', () => {
      const rule = getRule('exhaustion', 'levels')!;
      const table = rule.value as unknown as Record<string, string>;
      for (let level = 1; level <= 6; level++) {
        expect(typeof table[String(level)]).toBe('string');
        expect(table[String(level)].length).toBeGreaterThan(0);
      }
    });

    it('matches the SRD exhaustion effects per level', () => {
      const rule = getRule('exhaustion', 'levels')!;
      expect(rule.value).toEqual({
        '1': 'Disadvantage on ability checks',
        '2': 'Speed halved',
        '3': 'Disadvantage on attack rolls and saving throws',
        '4': 'Hit point maximum halved',
        '5': 'Speed reduced to 0',
        '6': 'Death',
      });
    });
  });

  describe('cover / types', () => {
    type CoverTypes = {
      half: { acBonus: number; dexSavingThrowBonus: number; description: string };
      'three-quarters': { acBonus: number; dexSavingThrowBonus: number; description: string };
      full: { description: string };
    };

    it('exists', () => {
      expect(getRule('cover', 'types')).toBeDefined();
    });

    it('matches the SRD cover types and bonuses', () => {
      const rule = getRule('cover', 'types')!;
      expect(rule.value).toEqual({
        half: {
          acBonus: 2,
          dexSavingThrowBonus: 2,
          description: 'Half cover: +2 AC and DEX saving throws',
        },
        'three-quarters': {
          acBonus: 5,
          dexSavingThrowBonus: 5,
          description: 'Three-quarters cover: +5 AC and DEX saving throws',
        },
        full: {
          description: "Full cover: can't be targeted directly by attacks or spells",
        },
      });
    });

    it('three-quarters cover gives a larger bonus than half cover', () => {
      const value = getRule('cover', 'types')!.value as unknown as CoverTypes;
      expect(value['three-quarters'].acBonus).toBeGreaterThan(value.half.acBonus);
      expect(value['three-quarters'].dexSavingThrowBonus).toBeGreaterThan(
        value.half.dexSavingThrowBonus
      );
    });
  });

  describe('carrying-capacity / rules', () => {
    type CarryingCapacity = {
      carryCapacity: string;
      pushDragLift: string;
      sizeMultipliers: Record<string, number>;
      encumbrance: { encumbered: string; heavilyEncumbered: string };
    };

    function getCarryingCapacity(): CarryingCapacity {
      return getRule('carrying-capacity', 'rules')!.value as unknown as CarryingCapacity;
    }

    it('exists', () => {
      expect(getRule('carrying-capacity', 'rules')).toBeDefined();
    });

    it('matches the SRD carrying-capacity rules', () => {
      const rule = getRule('carrying-capacity', 'rules')!;
      expect(rule.value).toEqual({
        carryCapacity: 'Strength score × 15 (in pounds)',
        pushDragLift: 'Strength score × 30 (in pounds)',
        sizeMultipliers: {
          Tiny: 0.5,
          Small: 1,
          Medium: 1,
          Large: 2,
          Huge: 4,
          Gargantuan: 8,
        },
        encumbrance: {
          encumbered: 'Strength score × 5 — speed reduced by 10 ft',
          heavilyEncumbered:
            'Strength score × 10 — speed reduced by 20 ft, disadvantage on ability checks, attack rolls, and STR/DEX/CON saving throws',
        },
      });
    });

    it('covers all six SRD size categories', () => {
      const { sizeMultipliers } = getCarryingCapacity();
      expect(Object.keys(sizeMultipliers).sort()).toEqual(
        ['Gargantuan', 'Huge', 'Large', 'Medium', 'Small', 'Tiny'].sort()
      );
    });

    it('size multipliers double each step from Medium upward', () => {
      const { sizeMultipliers } = getCarryingCapacity();
      expect(sizeMultipliers.Large).toBe(sizeMultipliers.Medium * 2);
      expect(sizeMultipliers.Huge).toBe(sizeMultipliers.Large * 2);
      expect(sizeMultipliers.Gargantuan).toBe(sizeMultipliers.Huge * 2);
    });
  });

  describe('size-categories / space', () => {
    it('exists', () => {
      expect(getRule('size-categories', 'space')).toBeDefined();
    });

    it('matches the SRD size-category space requirements', () => {
      const rule = getRule('size-categories', 'space')!;
      expect(rule.value).toEqual({
        Tiny: '2.5 × 2.5 ft',
        Small: '5 × 5 ft',
        Medium: '5 × 5 ft',
        Large: '10 × 10 ft',
        Huge: '15 × 15 ft',
        Gargantuan: '20 × 20 ft or larger',
      });
    });

    it('uses the same six size categories as carrying-capacity multipliers', () => {
      const space = getRule('size-categories', 'space')!.value as unknown as Record<string, string>;
      const multipliers = (
        getRule('carrying-capacity', 'rules')!.value as unknown as {
          sizeMultipliers: Record<string, number>;
        }
      ).sizeMultipliers;
      expect(Object.keys(space).sort()).toEqual(Object.keys(multipliers).sort());
    });
  });
});
