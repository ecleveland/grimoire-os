import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CharacterSheetHeader from '../CharacterSheetHeader';
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
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('CharacterSheetHeader', () => {
  describe('character info', () => {
    it('renders the character name', () => {
      render(<CharacterSheetHeader character={mockCharacter} isOwner={false} />);
      expect(screen.getByText('Thorin Ironforge')).toBeInTheDocument();
    });

    it('renders background, class, species, and subclass labels', () => {
      render(<CharacterSheetHeader character={mockCharacter} isOwner={false} />);
      expect(screen.getByText('Soldier')).toBeInTheDocument();
      expect(screen.getByText('Fighter')).toBeInTheDocument();
      expect(screen.getByText('Dwarf')).toBeInTheDocument();
      expect(screen.getByText('Champion')).toBeInTheDocument();
    });

    it('renders labeled field headers', () => {
      render(<CharacterSheetHeader character={mockCharacter} isOwner={false} />);
      expect(screen.getByText('Background')).toBeInTheDocument();
      expect(screen.getByText('Class')).toBeInTheDocument();
      expect(screen.getByText('Species')).toBeInTheDocument();
      expect(screen.getByText('Subclass')).toBeInTheDocument();
    });

    it('renders level in a badge', () => {
      render(<CharacterSheetHeader character={mockCharacter} isOwner={false} />);
      const badge = screen.getByTestId('level-badge');
      expect(badge).toHaveTextContent('5');
    });

    it('renders experience points', () => {
      render(<CharacterSheetHeader character={mockCharacter} isOwner={false} />);
      expect(screen.getByText('6,500 XP')).toBeInTheDocument();
    });
  });

  describe('edit button', () => {
    it('renders Edit link when isOwner is true', () => {
      render(<CharacterSheetHeader character={mockCharacter} isOwner={true} />);
      const editLink = screen.getByRole('link', { name: 'Edit' });
      expect(editLink).toBeInTheDocument();
      expect(editLink).toHaveAttribute('href', '/characters/char-1/edit');
    });

    it('does not render Edit link when isOwner is false', () => {
      render(<CharacterSheetHeader character={mockCharacter} isOwner={false} />);
      expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    });
  });

  describe('optional fields', () => {
    it('handles missing background gracefully', () => {
      const char = { ...mockCharacter, background: undefined };
      render(<CharacterSheetHeader character={char} isOwner={false} />);
      expect(screen.getByText('Background')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('handles missing subclass gracefully', () => {
      const char = { ...mockCharacter, subclass: undefined };
      render(<CharacterSheetHeader character={char} isOwner={false} />);
      expect(screen.getByTestId('field-subclass')).toHaveTextContent('—');
    });

    it('handles missing race gracefully', () => {
      const char = { ...mockCharacter, race: undefined };
      render(<CharacterSheetHeader character={char} isOwner={false} />);
      expect(screen.getByTestId('field-species')).toHaveTextContent('—');
    });
  });
});
