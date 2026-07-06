import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PersonalitySection from '../PersonalitySection';
import { makeCharacter } from '@/test-utils/character';

const baseCharacter = makeCharacter({
  alignment: 'Neutral Good',
  appearance: 'Tall with silver hair and violet eyes.',
  backstory: 'Grew up in the Arcane Academy, obsessed with ancient magic.',
  personalityTraits: 'Curious and methodical. Always taking notes.',
  ideals: 'Knowledge is the path to power and self-improvement.',
  bonds: 'The library where I learned my craft is the most important place in the world.',
  flaws: 'I overlook obvious solutions in favor of complicated ones.',
});

describe('PersonalitySection', () => {
  describe('Appearance', () => {
    it('renders the Appearance header and text', () => {
      render(<PersonalitySection character={baseCharacter} />);
      expect(screen.getByText('Appearance')).toBeInTheDocument();
      expect(screen.getByText('Tall with silver hair and violet eyes.')).toBeInTheDocument();
    });

    it('does not render Appearance section when appearance is undefined', () => {
      const char = { ...baseCharacter, appearance: undefined };
      render(<PersonalitySection character={char} />);
      expect(screen.queryByText('Appearance')).not.toBeInTheDocument();
    });
  });

  describe('Backstory & Personality', () => {
    it('renders the Backstory & Personality header', () => {
      render(<PersonalitySection character={baseCharacter} />);
      expect(screen.getByText('Backstory & Personality')).toBeInTheDocument();
    });

    it('renders backstory text', () => {
      render(<PersonalitySection character={baseCharacter} />);
      expect(
        screen.getByText('Grew up in the Arcane Academy, obsessed with ancient magic.')
      ).toBeInTheDocument();
    });

    it('renders personality traits with label', () => {
      render(<PersonalitySection character={baseCharacter} />);
      expect(screen.getByText('Personality Traits')).toBeInTheDocument();
      expect(screen.getByText('Curious and methodical. Always taking notes.')).toBeInTheDocument();
    });

    it('renders ideals with label', () => {
      render(<PersonalitySection character={baseCharacter} />);
      expect(screen.getByText('Ideals')).toBeInTheDocument();
      expect(
        screen.getByText('Knowledge is the path to power and self-improvement.')
      ).toBeInTheDocument();
    });

    it('renders bonds with label', () => {
      render(<PersonalitySection character={baseCharacter} />);
      expect(screen.getByText('Bonds')).toBeInTheDocument();
      expect(
        screen.getByText(
          'The library where I learned my craft is the most important place in the world.'
        )
      ).toBeInTheDocument();
    });

    it('renders flaws with label', () => {
      render(<PersonalitySection character={baseCharacter} />);
      expect(screen.getByText('Flaws')).toBeInTheDocument();
      expect(
        screen.getByText('I overlook obvious solutions in favor of complicated ones.')
      ).toBeInTheDocument();
    });

    it('does not render Backstory & Personality section when all sub-fields are undefined', () => {
      const char = {
        ...baseCharacter,
        backstory: undefined,
        personalityTraits: undefined,
        ideals: undefined,
        bonds: undefined,
        flaws: undefined,
      };
      render(<PersonalitySection character={char} />);
      expect(screen.queryByText('Backstory & Personality')).not.toBeInTheDocument();
    });

    it('renders section with only backstory when other fields are undefined', () => {
      const char = {
        ...baseCharacter,
        personalityTraits: undefined,
        ideals: undefined,
        bonds: undefined,
        flaws: undefined,
      };
      render(<PersonalitySection character={char} />);
      expect(screen.getByText('Backstory & Personality')).toBeInTheDocument();
      expect(
        screen.getByText('Grew up in the Arcane Academy, obsessed with ancient magic.')
      ).toBeInTheDocument();
    });
  });

  describe('Alignment', () => {
    it('renders alignment with label', () => {
      render(<PersonalitySection character={baseCharacter} />);
      expect(screen.getByText('Alignment')).toBeInTheDocument();
      expect(screen.getByText('Neutral Good')).toBeInTheDocument();
    });

    it('does not render Alignment when alignment is undefined', () => {
      const char = { ...baseCharacter, alignment: undefined };
      render(<PersonalitySection character={char} />);
      expect(screen.queryByText('Alignment')).not.toBeInTheDocument();
    });
  });

  describe('conditional rendering', () => {
    it('renders nothing when all personality fields are empty', () => {
      const char = {
        ...baseCharacter,
        appearance: undefined,
        backstory: undefined,
        personalityTraits: undefined,
        ideals: undefined,
        bonds: undefined,
        flaws: undefined,
        alignment: undefined,
      };
      const { container } = render(<PersonalitySection character={char} />);
      expect(container.innerHTML).toBe('');
    });
  });
});
