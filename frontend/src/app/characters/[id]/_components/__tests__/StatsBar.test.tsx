import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import StatsBar from '../StatsBar';
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
    wisdom: 14,
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
  skills: ['Perception', 'Athletics'],
  knownSpells: [],
  preparedSpells: [],
  spellSlots: [],
  inventory: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  features: [],
  size: 'Small',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('StatsBar', () => {
  describe('Proficiency Bonus', () => {
    it('renders proficiency bonus calculated from level', () => {
      // level 5 → prof bonus +3
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-prof-bonus');
      expect(within(block).getByText('+3')).toBeInTheDocument();
    });

    it('renders the label', () => {
      render(<StatsBar character={mockCharacter} />);
      expect(screen.getByText('Prof. Bonus')).toBeInTheDocument();
    });
  });

  describe('Initiative', () => {
    it('renders initiative as DEX modifier', () => {
      // DEX 12 → mod +1
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-initiative');
      expect(within(block).getByText('+1')).toBeInTheDocument();
    });
  });

  describe('Speed', () => {
    it('renders speed with ft suffix', () => {
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-speed');
      expect(within(block).getByText('25 ft')).toBeInTheDocument();
    });
  });

  describe('Size', () => {
    it('renders character size', () => {
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-size');
      expect(within(block).getByText('Small')).toBeInTheDocument();
    });

    it('defaults to Medium when size is undefined', () => {
      const char = { ...mockCharacter, size: undefined };
      render(<StatsBar character={char} />);
      const block = screen.getByTestId('stat-size');
      expect(within(block).getByText('Medium')).toBeInTheDocument();
    });
  });

  describe('Passive Perception', () => {
    it('renders passive perception with proficiency when Perception is a skill', () => {
      // WIS 14 → mod +2, prof bonus +3, 10 + 2 + 3 = 15
      render(<StatsBar character={mockCharacter} />);
      const block = screen.getByTestId('stat-passive-perception');
      expect(within(block).getByText('15')).toBeInTheDocument();
    });

    it('renders passive perception without proficiency when Perception is not a skill', () => {
      // WIS 14 → mod +2, no prof, 10 + 2 = 12
      const char = { ...mockCharacter, skills: ['Athletics'] };
      render(<StatsBar character={char} />);
      const block = screen.getByTestId('stat-passive-perception');
      expect(within(block).getByText('12')).toBeInTheDocument();
    });
  });

  describe('labels', () => {
    it('renders all five stat labels', () => {
      render(<StatsBar character={mockCharacter} />);
      expect(screen.getByText('Prof. Bonus')).toBeInTheDocument();
      expect(screen.getByText('Initiative')).toBeInTheDocument();
      expect(screen.getByText('Speed')).toBeInTheDocument();
      expect(screen.getByText('Size')).toBeInTheDocument();
      expect(screen.getByText('Passive Perception')).toBeInTheDocument();
    });
  });
});
