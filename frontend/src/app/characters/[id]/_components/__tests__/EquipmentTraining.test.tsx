import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import EquipmentTraining from '../EquipmentTraining';
import { makeCharacter } from '@/test-utils/character';

const mockCharacter = makeCharacter({
  proficiencies: ['Simple Weapons', 'Martial Weapons', "Smith's Tools", 'Dice Set'],
  armorTraining: ['Light', 'Medium', 'Heavy', 'Shields'],
  heroicInspiration: true,
});

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
    it('no longer renders heroic inspiration here (it lives on the CombatBar)', () => {
      render(<EquipmentTraining character={mockCharacter} />);
      expect(screen.queryByTestId('heroic-inspiration')).toBeNull();
      expect(screen.queryByText('Heroic Inspiration')).toBeNull();
    });
  });

  describe('conditional rendering', () => {
    it('renders nothing when there are no proficiencies or armor training', () => {
      const char = { ...mockCharacter, proficiencies: [], armorTraining: undefined };
      const { container } = render(<EquipmentTraining character={char} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when only heroic inspiration is set (no armor/proficiencies)', () => {
      const char = {
        ...mockCharacter,
        proficiencies: [],
        armorTraining: undefined,
        heroicInspiration: true,
      };
      const { container } = render(<EquipmentTraining character={char} />);
      expect(container.innerHTML).toBe('');
    });
  });
});
