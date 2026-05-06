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
});
