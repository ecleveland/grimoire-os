import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PersonalitySection from '../PersonalitySection';
import type { Character } from '@/lib/types';

const baseCharacter: Character = {
  id: 'char-1',
  userId: 'user-1',
  name: 'Elara Brightmoon',
  race: 'Elf',
  class: 'Wizard',
  level: 5,
  subclass: 'Evocation',
  background: 'Sage',
  alignment: 'Neutral Good',
  experiencePoints: 6500,
  abilityScores: {
    strength: 8,
    dexterity: 14,
    constitution: 12,
    intelligence: 18,
    wisdom: 13,
    charisma: 10,
  },
  hitPoints: { max: 32, current: 32, temporary: 0 },
  deathSaves: { successes: 0, failures: 0 },
  armorClass: 12,
  speed: 30,
  initiative: 2,
  proficiencies: [],
  languages: [],
  savingThrows: [],
  skills: [],
  knownSpells: [],
  preparedSpells: [],
  spellSlots: [],
  inventory: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  features: [],
  appearance: 'Tall with silver hair and violet eyes.',
  backstory: 'Grew up in the Arcane Academy, obsessed with ancient magic.',
  personalityTraits: 'Curious and methodical. Always taking notes.',
  ideals: 'Knowledge is the path to power and self-improvement.',
  bonds: 'The library where I learned my craft is the most important place in the world.',
  flaws: 'I overlook obvious solutions in favor of complicated ones.',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

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
