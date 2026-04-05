import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SpellcastingSection from '../SpellcastingSection';
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
  spellcastingAbility: 'Intelligence',
  spellSaveDC: 15,
  spellAttackBonus: 7,
  knownSpells: ['Fire Bolt', 'Mage Hand', 'Prestidigitation'],
  preparedSpells: ['Magic Missile', 'Shield', 'Fireball', 'Counterspell'],
  spellSlots: [
    { level: 1, total: 4, used: 2 },
    { level: 2, total: 3, used: 1 },
    { level: 3, total: 2, used: 0 },
  ],
  inventory: [],
  currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
  features: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('SpellcastingSection', () => {
  describe('conditional rendering', () => {
    it('renders nothing when spellcastingAbility is undefined', () => {
      const char = { ...baseCharacter, spellcastingAbility: undefined };
      const { container } = render(<SpellcastingSection character={char} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders when spellcastingAbility is set', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Spellcasting Ability')).toBeInTheDocument();
    });
  });

  describe('Spellcasting Stats Bar', () => {
    it('renders the spellcasting ability name', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Intelligence')).toBeInTheDocument();
    });

    it('renders the spellcasting modifier calculated from ability score', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      // INT 18 → modifier +4
      expect(screen.getByText('+4')).toBeInTheDocument();
    });

    it('renders the spell save DC', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('Spell Save DC')).toBeInTheDocument();
    });

    it('renders the spell attack bonus', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('+7')).toBeInTheDocument();
      expect(screen.getByText('Spell Attack Bonus')).toBeInTheDocument();
    });

    it('renders all four stat labels', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Spellcasting Ability')).toBeInTheDocument();
      expect(screen.getByText('Spellcasting Modifier')).toBeInTheDocument();
      expect(screen.getByText('Spell Save DC')).toBeInTheDocument();
      expect(screen.getByText('Spell Attack Bonus')).toBeInTheDocument();
    });
  });

  describe('Spell Slots Grid', () => {
    it('renders the Spell Slots header', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Spell Slots')).toBeInTheDocument();
    });

    it('renders spell slot levels', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Level 1')).toBeInTheDocument();
      expect(screen.getByText('Level 2')).toBeInTheDocument();
      expect(screen.getByText('Level 3')).toBeInTheDocument();
    });

    it('renders filled diamonds for used slots and empty diamonds for remaining', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      // Level 1: 4 total, 2 used → 2 filled + 2 empty
      const level1Row = screen.getByTestId('spell-slots-level-1');
      const filled = level1Row.querySelectorAll('[data-testid="slot-filled"]');
      const empty = level1Row.querySelectorAll('[data-testid="slot-empty"]');
      expect(filled).toHaveLength(2);
      expect(empty).toHaveLength(2);
    });

    it('renders all slots as empty when none are used', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      const level3Row = screen.getByTestId('spell-slots-level-3');
      const filled = level3Row.querySelectorAll('[data-testid="slot-filled"]');
      const empty = level3Row.querySelectorAll('[data-testid="slot-empty"]');
      expect(filled).toHaveLength(0);
      expect(empty).toHaveLength(2);
    });

    it('does not render spell slots section when spellSlots is empty', () => {
      const char = { ...baseCharacter, spellSlots: [] };
      render(<SpellcastingSection character={char} />);
      expect(screen.queryByText('Spell Slots')).not.toBeInTheDocument();
    });
  });

  describe('Cantrips & Prepared Spells', () => {
    it('renders the Cantrips & Prepared Spells header', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Cantrips & Prepared Spells')).toBeInTheDocument();
    });

    it('renders known spells', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Fire Bolt')).toBeInTheDocument();
      expect(screen.getByText('Mage Hand')).toBeInTheDocument();
      expect(screen.getByText('Prestidigitation')).toBeInTheDocument();
    });

    it('renders prepared spells', () => {
      render(<SpellcastingSection character={baseCharacter} />);
      expect(screen.getByText('Magic Missile')).toBeInTheDocument();
      expect(screen.getByText('Shield')).toBeInTheDocument();
      expect(screen.getByText('Fireball')).toBeInTheDocument();
      expect(screen.getByText('Counterspell')).toBeInTheDocument();
    });

    it('does not render spell list section when both lists are empty', () => {
      const char = { ...baseCharacter, knownSpells: [], preparedSpells: [] };
      render(<SpellcastingSection character={char} />);
      expect(screen.queryByText('Cantrips & Prepared Spells')).not.toBeInTheDocument();
    });

    it('renders only known spells when prepared is empty', () => {
      const char = { ...baseCharacter, preparedSpells: [] };
      render(<SpellcastingSection character={char} />);
      expect(screen.getByText('Cantrips & Prepared Spells')).toBeInTheDocument();
      expect(screen.getByText('Fire Bolt')).toBeInTheDocument();
    });
  });
});
