import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EquipmentTraining from '../EquipmentTraining';
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
  proficiencies: ['Simple Weapons', 'Martial Weapons', "Smith's Tools", 'Dice Set'],
  languages: [],
  savingThrows: [],
  skills: [],
  knownSpells: [],
  preparedSpells: [],
  spellSlots: [],
  inventory: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  features: [],
  armorTraining: ['Light', 'Medium', 'Heavy', 'Shields'],
  heroicInspiration: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('EquipmentTraining', () => {
  describe('Armor Training', () => {
    it('renders all four armor training options', () => {
      render(<EquipmentTraining character={mockCharacter} />);
      expect(screen.getByText('Light')).toBeInTheDocument();
      expect(screen.getByText('Medium')).toBeInTheDocument();
      expect(screen.getByText('Heavy')).toBeInTheDocument();
      expect(screen.getByText('Shields')).toBeInTheDocument();
    });

    it('fills indicators for trained armor types', () => {
      render(<EquipmentTraining character={mockCharacter} />);
      for (const type of ['Light', 'Medium', 'Heavy', 'Shields']) {
        const dot = screen.getByTestId(`armor-dot-${type.toLowerCase()}`);
        expect(dot.className).toContain('bg-indigo-600');
      }
    });

    it('shows empty indicators for untrained armor types', () => {
      const char = { ...mockCharacter, armorTraining: ['Light'] };
      render(<EquipmentTraining character={char} />);
      const lightDot = screen.getByTestId('armor-dot-light');
      expect(lightDot.className).toContain('bg-indigo-600');

      const heavyDot = screen.getByTestId('armor-dot-heavy');
      expect(heavyDot.className).toContain('bg-gray-300');
    });

    it('handles undefined armorTraining', () => {
      const char = { ...mockCharacter, armorTraining: undefined };
      render(<EquipmentTraining character={char} />);
      const lightDot = screen.getByTestId('armor-dot-light');
      expect(lightDot.className).toContain('bg-gray-300');
    });
  });

  describe('Proficiencies', () => {
    it('renders all proficiencies', () => {
      render(<EquipmentTraining character={mockCharacter} />);
      expect(screen.getByText('Simple Weapons')).toBeInTheDocument();
      expect(screen.getByText('Martial Weapons')).toBeInTheDocument();
      expect(screen.getByText("Smith's Tools")).toBeInTheDocument();
      expect(screen.getByText('Dice Set')).toBeInTheDocument();
    });
  });

  describe('Heroic Inspiration', () => {
    it('renders filled indicator when heroicInspiration is true', () => {
      render(<EquipmentTraining character={mockCharacter} />);
      const indicator = screen.getByTestId('heroic-inspiration');
      expect(indicator.className).toContain('bg-indigo-600');
    });

    it('renders empty indicator when heroicInspiration is false', () => {
      const char = { ...mockCharacter, heroicInspiration: false };
      render(<EquipmentTraining character={char} />);
      const indicator = screen.getByTestId('heroic-inspiration');
      expect(indicator.className).toContain('bg-gray-300');
    });

    it('renders empty indicator when heroicInspiration is undefined', () => {
      const char = { ...mockCharacter, heroicInspiration: undefined };
      render(<EquipmentTraining character={char} />);
      const indicator = screen.getByTestId('heroic-inspiration');
      expect(indicator.className).toContain('bg-gray-300');
    });
  });

  describe('conditional rendering', () => {
    it('renders nothing when no proficiencies, armor training, or heroic inspiration', () => {
      const char = {
        ...mockCharacter,
        proficiencies: [],
        armorTraining: undefined,
        heroicInspiration: undefined,
      };
      const { container } = render(<EquipmentTraining character={char} />);
      expect(container.innerHTML).toBe('');
    });
  });
});
