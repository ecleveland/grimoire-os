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
  knownSpells: [],
  preparedSpells: [],
  spellSlots: [],
  inventory: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  features: [
    { name: 'Darkvision', source: 'Dwarf', description: 'See in dim light within 60 feet.' },
    { name: 'Dwarven Resilience', source: 'Dwarf', description: 'Advantage on poison saves.' },
    { name: 'Great Weapon Master', source: 'Feat', description: 'Bonus attack on crit or kill.' },
    { name: 'Sentinel', source: 'Feat', description: 'Opportunity attacks reduce speed to 0.' },
    { name: 'Second Wind', source: 'Fighter', description: 'Regain HP as a bonus action.' },
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

    it('renders features with source "Feat"', () => {
      render(<SpeciesTraitsAndFeats character={baseCharacter} />);
      expect(screen.getByText('Great Weapon Master')).toBeInTheDocument();
      expect(screen.getByText('Sentinel')).toBeInTheDocument();
    });

    it('renders features with unknown source as feats', () => {
      const char: Character = {
        ...baseCharacter,
        features: [
          { name: 'Mystery Power', source: 'Unknown', description: 'Something mysterious.' },
        ],
      };
      render(<SpeciesTraitsAndFeats character={char} />);
      expect(screen.getByText('Mystery Power')).toBeInTheDocument();
    });

    it('renders features with no source as feats', () => {
      const char: Character = {
        ...baseCharacter,
        features: [{ name: 'Homebrew Ability', description: 'Custom feature.' }],
      };
      render(<SpeciesTraitsAndFeats character={char} />);
      expect(screen.getByText('Homebrew Ability')).toBeInTheDocument();
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
      };
      const { container } = render(<SpeciesTraitsAndFeats character={char} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when features array is empty', () => {
      const char = { ...baseCharacter, features: [] };
      const { container } = render(<SpeciesTraitsAndFeats character={char} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders only Species Traits when no feats exist', () => {
      const char: Character = {
        ...baseCharacter,
        features: [{ name: 'Darkvision', source: 'Dwarf' }],
      };
      render(<SpeciesTraitsAndFeats character={char} />);
      expect(screen.getByText('Species Traits')).toBeInTheDocument();
      expect(screen.getByText('Feats')).toBeInTheDocument();
      expect(screen.getByText('Darkvision')).toBeInTheDocument();
    });

    it('renders only Feats when no species traits exist', () => {
      const char: Character = {
        ...baseCharacter,
        features: [{ name: 'Lucky', source: 'Feat' }],
      };
      render(<SpeciesTraitsAndFeats character={char} />);
      expect(screen.getByText('Species Traits')).toBeInTheDocument();
      expect(screen.getByText('Feats')).toBeInTheDocument();
      expect(screen.getByText('Lucky')).toBeInTheDocument();
    });
  });
});
