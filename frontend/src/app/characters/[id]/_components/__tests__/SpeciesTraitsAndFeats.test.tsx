import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SpeciesTraitsAndFeats from '../SpeciesTraitsAndFeats';
import type { Character } from '@/lib/types';

const baseCharacter: Character = {
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
  proficiencies: [],
  languages: [],
  savingThrows: [],
  skills: [],
  spells: [],
  attunedItems: [],
  spellSlots: [],
  inventory: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  features: [
    { name: 'Darkvision', source: 'Dwarf', description: 'See in dim light within 60 feet.' },
    { name: 'Dwarven Resilience', source: 'Dwarf', description: 'Advantage on poison saves.' },
    { name: 'Second Wind', source: 'Fighter', description: 'Regain HP as a bonus action.' },
  ],
  // Feats are carried structured (VEG-430), not inferred from `features`.
  feats: [
    { featId: 'feat-mi', name: 'Magic Initiate', option: 'Cleric', source: 'Acolyte' },
    { featId: 'feat-sentinel', name: 'Sentinel', option: null, source: 'Soldier' },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('SpeciesTraitsAndFeats', () => {
  describe('Species Traits section', () => {
    it('renders the Species Traits header', () => {
      render(<SpeciesTraitsAndFeats character={baseCharacter} />);
      expect(screen.getByText('Species Traits')).toBeInTheDocument();
    });

    it('renders features matching the character race', () => {
      render(<SpeciesTraitsAndFeats character={baseCharacter} />);
      expect(screen.getByText('Darkvision')).toBeInTheDocument();
      expect(screen.getByText('Dwarven Resilience')).toBeInTheDocument();
    });

    it('renders species trait descriptions', () => {
      render(<SpeciesTraitsAndFeats character={baseCharacter} />);
      expect(screen.getByText('See in dim light within 60 feet.')).toBeInTheDocument();
      expect(screen.getByText('Advantage on poison saves.')).toBeInTheDocument();
    });
  });

  describe('Feats section', () => {
    it('renders the Feats header', () => {
      render(<SpeciesTraitsAndFeats character={baseCharacter} />);
      expect(screen.getByText('Feats')).toBeInTheDocument();
    });

    it('renders each granted feat from the structured feats field', () => {
      render(<SpeciesTraitsAndFeats character={baseCharacter} />);
      expect(screen.getByText('Magic Initiate')).toBeInTheDocument();
      expect(screen.getByText('Sentinel')).toBeInTheDocument();
    });

    it('shows the chosen option for a parameterized feat', () => {
      render(<SpeciesTraitsAndFeats character={baseCharacter} />);
      expect(screen.getByText('(Cleric)')).toBeInTheDocument();
    });

    it('renders a plain feat without an option suffix', () => {
      const char: Character = {
        ...baseCharacter,
        feats: [{ name: 'Alert', option: null, source: 'Criminal' }],
      };
      render(<SpeciesTraitsAndFeats character={char} />);
      expect(screen.getByText('Alert')).toBeInTheDocument();
      expect(screen.queryByText(/\(/)).not.toBeInTheDocument();
    });

    // Backward compatibility: characters created before VEG-430 (or via the
    // classic editor's FeaturesEditor) carry feats as `features` whose source is
    // neither the class nor the race. Those must keep rendering (with their
    // description) even with no structured `feats`.
    it('still renders legacy feats stored in features (non-class/non-race source)', () => {
      const char: Character = {
        ...baseCharacter,
        features: [
          { name: 'Great Weapon Master', source: 'Feat', description: 'Bonus attack on crit.' },
          { name: 'Homebrew Ability', description: 'Custom feature with no source.' },
        ],
        feats: [],
      };
      render(<SpeciesTraitsAndFeats character={char} />);
      expect(screen.getByText('Great Weapon Master')).toBeInTheDocument();
      expect(screen.getByText('Bonus attack on crit.')).toBeInTheDocument();
      expect(screen.getByText('Homebrew Ability')).toBeInTheDocument();
    });

    it('renders both structured feats and legacy feature-feats together', () => {
      const char: Character = {
        ...baseCharacter,
        features: [{ name: 'Lucky', source: 'Feat' }],
        feats: [{ featId: 'feat-mi', name: 'Magic Initiate', option: 'Cleric', source: 'Acolyte' }],
      };
      render(<SpeciesTraitsAndFeats character={char} />);
      expect(screen.getByText('Magic Initiate')).toBeInTheDocument();
      expect(screen.getByText('(Cleric)')).toBeInTheDocument();
      expect(screen.getByText('Lucky')).toBeInTheDocument();
    });
  });

  describe('filtering', () => {
    it('does not render class features', () => {
      render(<SpeciesTraitsAndFeats character={baseCharacter} />);
      expect(screen.queryByText('Second Wind')).not.toBeInTheDocument();
    });
  });

  describe('conditional rendering', () => {
    it('renders nothing when no species traits or feats exist', () => {
      const char: Character = {
        ...baseCharacter,
        features: [{ name: 'Second Wind', source: 'Fighter' }],
        feats: [],
      };
      const { container } = render(<SpeciesTraitsAndFeats character={char} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when features and feats are both empty', () => {
      const char: Character = { ...baseCharacter, features: [], feats: [] };
      const { container } = render(<SpeciesTraitsAndFeats character={char} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders only Species Traits when no feats exist', () => {
      const char: Character = {
        ...baseCharacter,
        features: [{ name: 'Darkvision', source: 'Dwarf' }],
        feats: [],
      };
      render(<SpeciesTraitsAndFeats character={char} />);
      expect(screen.getByText('Species Traits')).toBeInTheDocument();
      expect(screen.getByText('Feats')).toBeInTheDocument();
      expect(screen.getByText('Darkvision')).toBeInTheDocument();
    });

    it('renders only Feats when no species traits exist', () => {
      const char: Character = {
        ...baseCharacter,
        features: [],
        feats: [{ name: 'Lucky', option: null, source: 'Custom' }],
      };
      render(<SpeciesTraitsAndFeats character={char} />);
      expect(screen.getByText('Species Traits')).toBeInTheDocument();
      expect(screen.getByText('Feats')).toBeInTheDocument();
      expect(screen.getByText('Lucky')).toBeInTheDocument();
    });
  });
});
