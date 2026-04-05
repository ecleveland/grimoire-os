import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CombatBar from '../CombatBar';
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
  hitPoints: { max: 44, current: 32, temporary: 5 },
  deathSaves: { successes: 2, failures: 1 },
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
  features: [],
  hitDice: { dieType: 'd10', total: 8, spent: 3 },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('CombatBar', () => {
  describe('Armor Class', () => {
    it('renders the AC value', () => {
      render(<CombatBar character={mockCharacter} />);
      const acBlock = screen.getByTestId('ac-block');
      expect(within(acBlock).getByText('18')).toBeInTheDocument();
    });

    it('renders the Armor Class label', () => {
      render(<CombatBar character={mockCharacter} />);
      expect(screen.getByText('Armor Class')).toBeInTheDocument();
    });
  });

  describe('Hit Points', () => {
    it('renders current/max HP', () => {
      render(<CombatBar character={mockCharacter} />);
      const hpBlock = screen.getByTestId('hp-block');
      expect(within(hpBlock).getByText('32/44')).toBeInTheDocument();
    });

    it('shows temp HP when greater than 0', () => {
      render(<CombatBar character={mockCharacter} />);
      const hpBlock = screen.getByTestId('hp-block');
      expect(within(hpBlock).getByText('+5 temp')).toBeInTheDocument();
    });

    it('does not show temp HP when 0', () => {
      const char = { ...mockCharacter, hitPoints: { max: 44, current: 44, temporary: 0 } };
      render(<CombatBar character={char} />);
      const hpBlock = screen.getByTestId('hp-block');
      expect(within(hpBlock).queryByText(/temp/)).toBeNull();
    });

    it('shows green bar when HP > 50%', () => {
      const char = { ...mockCharacter, hitPoints: { max: 44, current: 30, temporary: 0 } };
      render(<CombatBar character={char} />);
      const bar = screen.getByTestId('hp-bar');
      expect(bar.className).toContain('bg-green');
    });

    it('shows yellow bar when HP is 25-50%', () => {
      const char = { ...mockCharacter, hitPoints: { max: 44, current: 15, temporary: 0 } };
      render(<CombatBar character={char} />);
      const bar = screen.getByTestId('hp-bar');
      expect(bar.className).toContain('bg-yellow');
    });

    it('shows red bar when HP < 25%', () => {
      const char = { ...mockCharacter, hitPoints: { max: 44, current: 5, temporary: 0 } };
      render(<CombatBar character={char} />);
      const bar = screen.getByTestId('hp-bar');
      expect(bar.className).toContain('bg-red');
    });
  });

  describe('Hit Dice', () => {
    it('renders spent/total with die type', () => {
      render(<CombatBar character={mockCharacter} />);
      const hdBlock = screen.getByTestId('hd-block');
      expect(within(hdBlock).getByText('3/8')).toBeInTheDocument();
      expect(within(hdBlock).getByText('d10')).toBeInTheDocument();
    });

    it('does not render Hit Dice block when hitDice is undefined', () => {
      const char = { ...mockCharacter, hitDice: undefined };
      render(<CombatBar character={char} />);
      expect(screen.queryByTestId('hd-block')).toBeNull();
    });
  });

  describe('Death Saves', () => {
    it('renders 3 success circles', () => {
      render(<CombatBar character={mockCharacter} />);
      const successCircles = screen.getAllByTestId(/^death-success-/);
      expect(successCircles).toHaveLength(3);
    });

    it('renders 3 failure circles', () => {
      render(<CombatBar character={mockCharacter} />);
      const failCircles = screen.getAllByTestId(/^death-failure-/);
      expect(failCircles).toHaveLength(3);
    });

    it('fills correct number of success circles', () => {
      // 2 successes: first 2 filled, third empty
      render(<CombatBar character={mockCharacter} />);
      expect(screen.getByTestId('death-success-0').className).toContain('bg-green');
      expect(screen.getByTestId('death-success-1').className).toContain('bg-green');
      expect(screen.getByTestId('death-success-2').className).not.toContain('bg-green');
    });

    it('fills correct number of failure circles', () => {
      // 1 failure: first filled, second and third empty
      render(<CombatBar character={mockCharacter} />);
      expect(screen.getByTestId('death-failure-0').className).toContain('bg-red');
      expect(screen.getByTestId('death-failure-1').className).not.toContain('bg-red');
      expect(screen.getByTestId('death-failure-2').className).not.toContain('bg-red');
    });

    it('renders all circles empty when no saves used', () => {
      const char = { ...mockCharacter, deathSaves: { successes: 0, failures: 0 } };
      render(<CombatBar character={char} />);
      for (let i = 0; i < 3; i++) {
        expect(screen.getByTestId(`death-success-${i}`).className).not.toContain('bg-green');
        expect(screen.getByTestId(`death-failure-${i}`).className).not.toContain('bg-red');
      }
    });
  });
});
