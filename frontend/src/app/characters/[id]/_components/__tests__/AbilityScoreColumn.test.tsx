import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import AbilityScoreColumn from '../AbilityScoreColumn';
import type { Character } from '@/lib/types';

const mockCharacter: Character = {
  id: 'char-1',
  userId: 'user-1',
  name: 'Thorin Ironforge',
  race: 'Dwarf',
  class: 'Fighter',
  level: 5,
  subclass: 'Champion',
  background: 'Soldier',
  alignment: 'Lawful Good',
  experiencePoints: 6500,
  abilityScores: {
    strength: 16,
    dexterity: 12,
    constitution: 14,
    intelligence: 10,
    wisdom: 13,
    charisma: 8,
  },
  hitPoints: { max: 44, current: 44, temporary: 0 },
  deathSaves: { successes: 0, failures: 0 },
  armorClass: 18,
  speed: 25,
  initiative: 1,
  proficiencies: ['Light Armor', 'Medium Armor', 'Heavy Armor', 'Shields'],
  languages: ['Common', 'Dwarvish'],
  savingThrows: ['Strength', 'Constitution'],
  skills: ['Athletics', 'Intimidation'],
  knownSpells: [],
  preparedSpells: [],
  spellSlots: [],
  inventory: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 },
  features: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('AbilityScoreColumn', () => {
  describe('ability headers', () => {
    it('renders all six ability labels', () => {
      render(<AbilityScoreColumn character={mockCharacter} />);
      for (const label of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });
  });

  describe('modifiers and scores', () => {
    it.each([
      ['strength', '+3', '(16)'],
      ['dexterity', '+1', '(12)'],
      ['constitution', '+2', '(14)'],
      ['intelligence', '+0', '(10)'],
      ['wisdom', '+1', '(13)'],
      ['charisma', '-1', '(8)'],
    ])('%s shows modifier %s and score %s', (key, mod, score) => {
      render(<AbilityScoreColumn character={mockCharacter} />);
      expect(screen.getByTestId(`modifier-${key}`)).toHaveTextContent(mod);
      expect(screen.getByTestId(`score-${key}`)).toHaveTextContent(score);
    });
  });

  describe('saving throws', () => {
    it('renders a saving throw line for every ability', () => {
      render(<AbilityScoreColumn character={mockCharacter} />);
      const saveLabels = screen.getAllByText('Saving Throw');
      expect(saveLabels).toHaveLength(6);
    });

    it('shows proficient save bonus with proficiency bonus included', () => {
      render(<AbilityScoreColumn character={mockCharacter} />);
      // STR: mod +3, prof +3 = +6
      const strCard = screen.getByTestId('ability-card-strength');
      const strSaveRow = within(strCard).getByTestId('save-row-strength');
      expect(within(strSaveRow).getByText('+6')).toBeInTheDocument();

      // CON: mod +2, prof +3 = +5
      const conCard = screen.getByTestId('ability-card-constitution');
      const conSaveRow = within(conCard).getByTestId('save-row-constitution');
      expect(within(conSaveRow).getByText('+5')).toBeInTheDocument();
    });

    it('shows non-proficient save bonus as modifier only', () => {
      render(<AbilityScoreColumn character={mockCharacter} />);
      // DEX: mod +1, no prof = +1
      const dexCard = screen.getByTestId('ability-card-dexterity');
      const dexSaveRow = within(dexCard).getByTestId('save-row-dexterity');
      expect(within(dexSaveRow).getByText('+1')).toBeInTheDocument();

      // CHA: mod -1, no prof = -1
      const chaCard = screen.getByTestId('ability-card-charisma');
      const chaSaveRow = within(chaCard).getByTestId('save-row-charisma');
      expect(within(chaSaveRow).getByText('-1')).toBeInTheDocument();
    });

    it('renders filled dot for proficient saves, empty for non-proficient', () => {
      render(<AbilityScoreColumn character={mockCharacter} />);
      const strDot = screen.getByTestId('save-dot-strength');
      expect(strDot.className).toContain('bg-indigo-600');

      const conDot = screen.getByTestId('save-dot-constitution');
      expect(conDot.className).toContain('bg-indigo-600');

      const dexDot = screen.getByTestId('save-dot-dexterity');
      expect(dexDot.className).toContain('bg-gray-300');

      const chaDot = screen.getByTestId('save-dot-charisma');
      expect(chaDot.className).toContain('bg-gray-300');
    });
  });

  describe('skills', () => {
    it('renders skills under the correct ability', () => {
      render(<AbilityScoreColumn character={mockCharacter} />);

      const strCard = screen.getByTestId('ability-card-strength');
      expect(within(strCard).getByText('Athletics')).toBeInTheDocument();

      const dexCard = screen.getByTestId('ability-card-dexterity');
      expect(within(dexCard).getByText('Acrobatics')).toBeInTheDocument();
      expect(within(dexCard).getByText('Sleight of Hand')).toBeInTheDocument();
      expect(within(dexCard).getByText('Stealth')).toBeInTheDocument();

      // CON has no skills
      const conCard = screen.getByTestId('ability-card-constitution');
      expect(within(conCard).queryByTestId(/^skill-dot-/)).toBeNull();

      const intCard = screen.getByTestId('ability-card-intelligence');
      for (const skill of ['Arcana', 'History', 'Investigation', 'Nature', 'Religion']) {
        expect(within(intCard).getByText(skill)).toBeInTheDocument();
      }

      const wisCard = screen.getByTestId('ability-card-wisdom');
      for (const skill of ['Animal Handling', 'Insight', 'Medicine', 'Perception', 'Survival']) {
        expect(within(wisCard).getByText(skill)).toBeInTheDocument();
      }

      const chaCard = screen.getByTestId('ability-card-charisma');
      for (const skill of ['Deception', 'Intimidation', 'Performance', 'Persuasion']) {
        expect(within(chaCard).getByText(skill)).toBeInTheDocument();
      }
    });

    it('shows proficient skill bonus with proficiency bonus included', () => {
      render(<AbilityScoreColumn character={mockCharacter} />);
      // Athletics: STR mod +3, prof +3 = +6
      const strCard = screen.getByTestId('ability-card-strength');
      const athleticsRow = within(strCard).getByTestId('skill-row-athletics');
      expect(within(athleticsRow).getByText('+6')).toBeInTheDocument();

      // Intimidation: CHA mod -1, prof +3 = +2
      const chaCard = screen.getByTestId('ability-card-charisma');
      const intimidationRow = within(chaCard).getByTestId('skill-row-intimidation');
      expect(within(intimidationRow).getByText('+2')).toBeInTheDocument();
    });

    it('shows non-proficient skill bonus as modifier only', () => {
      render(<AbilityScoreColumn character={mockCharacter} />);
      // Stealth: DEX mod +1, no prof = +1
      const dexCard = screen.getByTestId('ability-card-dexterity');
      const stealthRow = within(dexCard).getByTestId('skill-row-stealth');
      expect(within(stealthRow).getByText('+1')).toBeInTheDocument();

      // Arcana: INT mod +0, no prof = +0
      const intCard = screen.getByTestId('ability-card-intelligence');
      const arcanaRow = within(intCard).getByTestId('skill-row-arcana');
      expect(within(arcanaRow).getByText('+0')).toBeInTheDocument();
    });

    it('renders filled dot for proficient skills, empty for non-proficient', () => {
      render(<AbilityScoreColumn character={mockCharacter} />);
      const athleticsDot = screen.getByTestId('skill-dot-athletics');
      expect(athleticsDot.className).toContain('bg-indigo-600');

      const intimidationDot = screen.getByTestId('skill-dot-intimidation');
      expect(intimidationDot.className).toContain('bg-indigo-600');

      const stealthDot = screen.getByTestId('skill-dot-stealth');
      expect(stealthDot.className).toContain('bg-gray-300');

      const arcanaDot = screen.getByTestId('skill-dot-arcana');
      expect(arcanaDot.className).toContain('bg-gray-300');
    });
  });

  describe('edge cases', () => {
    it('handles character with no proficient skills or saving throws', () => {
      const unproficientCharacter: Character = {
        ...mockCharacter,
        savingThrows: [],
        skills: [],
      };
      render(<AbilityScoreColumn character={unproficientCharacter} />);

      // All save dots should be empty
      const strDot = screen.getByTestId('save-dot-strength');
      expect(strDot.className).toContain('bg-gray-300');

      const conDot = screen.getByTestId('save-dot-constitution');
      expect(conDot.className).toContain('bg-gray-300');

      // Save bonuses should be modifier-only
      const strSaveRow = screen.getByTestId('save-row-strength');
      expect(within(strSaveRow).getByText('+3')).toBeInTheDocument();

      // Skill dots should all be empty
      const athleticsDot = screen.getByTestId('skill-dot-athletics');
      expect(athleticsDot.className).toContain('bg-gray-300');
    });
  });
});
