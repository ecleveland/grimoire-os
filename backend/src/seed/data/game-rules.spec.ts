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
});
