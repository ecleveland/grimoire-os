import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AbilityScoreColumn from '../AbilityScoreColumn';
import type { Character } from '@/lib/types';
import { makeCharacter } from '@/test-utils/character';

const mockMessage = vi.fn();
vi.mock('sonner', () => ({ toast: { message: (...args: unknown[]) => mockMessage(...args) } }));

const mockCharacter = makeCharacter({
  savingThrows: ['Strength', 'Constitution'],
  skills: ['Athletics', 'Intimidation'],
});

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

  describe('dice rolls (canRoll)', () => {
    beforeEach(() => mockMessage.mockReset());

    it('renders no roll buttons when canRoll is falsy', () => {
      render(<AbilityScoreColumn character={mockCharacter} />);
      expect(screen.queryByRole('button', { name: /roll strength check/i })).toBeNull();
    });

    it('rolls an ability check, saving throw, and skill', async () => {
      const user = userEvent.setup();
      render(<AbilityScoreColumn character={mockCharacter} canRoll />);

      await user.click(screen.getByRole('button', { name: 'Roll Strength check' }));
      expect(mockMessage).toHaveBeenLastCalledWith(expect.stringContaining('Strength check'));

      await user.click(screen.getByRole('button', { name: 'Roll Strength save' }));
      expect(mockMessage).toHaveBeenLastCalledWith(expect.stringContaining('Strength save'));

      await user.click(screen.getByRole('button', { name: 'Roll Athletics' }));
      expect(mockMessage).toHaveBeenLastCalledWith(expect.stringContaining('Athletics check'));
    });
  });

  describe('edge cases', () => {
    it('handles character with no proficient skills or saving throws', () => {
      // Built through the factory so `computed` reflects the empty proficiency
      // lists (a spread of mockCharacter would keep its proficient computed block).
      const unproficientCharacter: Character = makeCharacter({
        savingThrows: [],
        skills: [],
      });
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

describe('null abilityScores (VEG-425)', () => {
  it('renders +0 modifiers and (10) scores instead of crashing', () => {
    const char = makeCharacter({
      abilityScores: null,
      savingThrows: ['Strength', 'Constitution'],
      skills: ['Athletics', 'Intimidation'],
    });
    render(<AbilityScoreColumn character={char} />);
    expect(screen.getByTestId('modifier-strength')).toHaveTextContent('+0');
    expect(screen.getByTestId('score-strength')).toHaveTextContent('(10)');
  });
});

describe('computed block is the source of truth (VEG-412)', () => {
  // Computed values that DISAGREE with client math over the stored fields —
  // every derived readout must follow computed. The raw (score) stays stored.
  const divergent: Character = {
    ...mockCharacter,
    computed: {
      ...mockCharacter.computed,
      abilityModifiers: { ...mockCharacter.computed.abilityModifiers, strength: 9 },
      savingThrows: {
        ...mockCharacter.computed.savingThrows,
        // Stored lists say STR is proficient (+6); computed disagrees.
        Strength: { proficient: false, bonus: 2 },
        // Stored lists say DEX is not proficient (+1); computed disagrees.
        Dexterity: { proficient: true, bonus: 8 },
      },
      skills: {
        ...mockCharacter.computed.skills,
        // Stored lists say Athletics is proficient (+6); computed disagrees.
        Athletics: { ability: 'Strength', proficient: false, bonus: 4 },
      },
    },
  };

  it('renders ability modifiers from computed, not score math', () => {
    // STR 16 would derive +3; computed says +9. Raw score display unchanged.
    render(<AbilityScoreColumn character={divergent} />);
    expect(screen.getByTestId('modifier-strength')).toHaveTextContent('+9');
    expect(screen.getByTestId('score-strength')).toHaveTextContent('(16)');
  });

  it('renders save bonus and proficiency dot from computed', () => {
    render(<AbilityScoreColumn character={divergent} />);
    const strSaveRow = screen.getByTestId('save-row-strength');
    expect(within(strSaveRow).getByText('+2')).toBeInTheDocument();
    expect(screen.getByTestId('save-dot-strength').className).toContain('bg-gray-300');

    const dexSaveRow = screen.getByTestId('save-row-dexterity');
    expect(within(dexSaveRow).getByText('+8')).toBeInTheDocument();
    expect(screen.getByTestId('save-dot-dexterity').className).toContain('bg-indigo-600');
  });

  it('renders skill bonus and proficiency dot from computed', () => {
    render(<AbilityScoreColumn character={divergent} />);
    const athleticsRow = screen.getByTestId('skill-row-athletics');
    expect(within(athleticsRow).getByText('+4')).toBeInTheDocument();
    expect(screen.getByTestId('skill-dot-athletics').className).toContain('bg-gray-300');
  });

  it('falls back to the ability modifier when a skill is missing from computed.skills', () => {
    // Guards against a skill-name key mismatch between the frontend SKILLS list
    // and the backend game-rules keys — degrade to the governing ability's
    // modifier (like an unproficient skill), matching the save fallback.
    const missingSkill: Character = {
      ...mockCharacter,
      computed: {
        ...mockCharacter.computed,
        skills: Object.fromEntries(
          Object.entries(mockCharacter.computed.skills).filter(([name]) => name !== 'Stealth')
        ),
      },
    };
    render(<AbilityScoreColumn character={missingSkill} />);
    // Stealth is a DEX skill; computed DEX modifier is +1.
    const stealthRow = screen.getByTestId('skill-row-stealth');
    expect(within(stealthRow).getByText('+1')).toBeInTheDocument();
    expect(screen.getByTestId('skill-dot-stealth').className).toContain('bg-gray-300');
  });
});

describe('exhaustion penalties reach saves and skills (VEG-449)', () => {
  // Exhaustion reduces every d20 Test by 2 × level. These readouts render the
  // computed bonuses directly, so the penalty must arrive already folded in —
  // the component does no rule math of its own.
  const exhausted = makeCharacter({
    savingThrows: ['Strength', 'Constitution'],
    skills: ['Athletics', 'Intimidation'],
    exhaustion: 3,
  });

  it('reduces proficient and unproficient saving throws alike', () => {
    render(<AbilityScoreColumn character={exhausted} />);
    // STR: mod +3, prof +3, −6 = +0
    const strSaveRow = within(screen.getByTestId('ability-card-strength')).getByTestId(
      'save-row-strength'
    );
    expect(within(strSaveRow).getByText('+0')).toBeInTheDocument();

    // DEX (unproficient): mod +1, −6 = −5
    const dexSaveRow = within(screen.getByTestId('ability-card-dexterity')).getByTestId(
      'save-row-dexterity'
    );
    expect(within(dexSaveRow).getByText('-5')).toBeInTheDocument();
  });

  it('reduces skill bonuses', () => {
    render(<AbilityScoreColumn character={exhausted} />);
    // Athletics (STR, proficient): +3 +3 −6 = +0
    expect(within(screen.getByTestId('skill-row-athletics')).getByText('+0')).toBeInTheDocument();
    // Stealth (DEX, unproficient): +1 −6 = −5
    expect(within(screen.getByTestId('skill-row-stealth')).getByText('-5')).toBeInTheDocument();
  });

  it('leaves the raw ability modifiers unpenalized', () => {
    // The penalty applies to the roll, not the score — the ability card's own
    // modifier must still read +3 for STR 16.
    render(<AbilityScoreColumn character={exhausted} />);
    const strCard = screen.getByTestId('ability-card-strength');
    expect(within(strCard).getByText('+3')).toBeInTheDocument();
  });
});
