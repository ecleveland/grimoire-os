import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LanguagesSection from '../LanguagesSection';
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
  languages: ['Common', 'Dwarvish', 'Undercommon'],
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

describe('LanguagesSection', () => {
  it('renders the Languages header', () => {
    render(<LanguagesSection character={baseCharacter} />);
    expect(screen.getByText('Languages')).toBeInTheDocument();
  });

  it('renders all languages as tag chips', () => {
    render(<LanguagesSection character={baseCharacter} />);
    expect(screen.getByText('Common')).toBeInTheDocument();
    expect(screen.getByText('Dwarvish')).toBeInTheDocument();
    expect(screen.getByText('Undercommon')).toBeInTheDocument();
  });

  it('renders chips with correct styling', () => {
    render(<LanguagesSection character={baseCharacter} />);
    const chip = screen.getByText('Common');
    expect(chip.className).toContain('bg-gray-100');
    expect(chip.className).toContain('rounded');
  });

  it('renders nothing when languages array is empty', () => {
    const char = { ...baseCharacter, languages: [] };
    const { container } = render(<LanguagesSection character={char} />);
    expect(container.innerHTML).toBe('');
  });
});
