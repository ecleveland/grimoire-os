import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClassFeatures from '../ClassFeatures';
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
    { name: 'Second Wind', source: 'Fighter', description: 'Regain HP as a bonus action.' },
    { name: 'Action Surge', source: 'Fighter', description: 'Take an additional action.' },
    { name: 'Darkvision', source: 'Dwarf', description: 'See in dim light within 60 feet.' },
    { name: 'Great Weapon Master', source: 'Feat', description: 'Bonus attack on crit or kill.' },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ClassFeatures', () => {
  it('renders the section header', () => {
    render(<ClassFeatures character={baseCharacter} />);
    expect(screen.getByText('Class Features')).toBeInTheDocument();
  });

  it('renders only features matching the character class', () => {
    render(<ClassFeatures character={baseCharacter} />);
    expect(screen.getByText('Second Wind')).toBeInTheDocument();
    expect(screen.getByText('Action Surge')).toBeInTheDocument();
    expect(screen.queryByText('Darkvision')).not.toBeInTheDocument();
    expect(screen.queryByText('Great Weapon Master')).not.toBeInTheDocument();
  });

  it('renders feature descriptions', () => {
    render(<ClassFeatures character={baseCharacter} />);
    expect(screen.getByText('Regain HP as a bonus action.')).toBeInTheDocument();
    expect(screen.getByText('Take an additional action.')).toBeInTheDocument();
  });

  it('renders source tags on features', () => {
    render(<ClassFeatures character={baseCharacter} />);
    const tags = screen.getAllByText('Fighter');
    expect(tags.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to all features when none match the class', () => {
    const char: Character = {
      ...baseCharacter,
      class: 'Wizard',
      features: [
        { name: 'Lucky', description: 'Reroll dice.' },
        { name: 'Tough', description: 'Extra HP.' },
      ],
    };
    render(<ClassFeatures character={char} />);
    expect(screen.getByText('Lucky')).toBeInTheDocument();
    expect(screen.getByText('Tough')).toBeInTheDocument();
  });

  it('renders features without descriptions gracefully', () => {
    const char: Character = {
      ...baseCharacter,
      features: [{ name: 'Second Wind', source: 'Fighter' }],
    };
    render(<ClassFeatures character={char} />);
    expect(screen.getByText('Second Wind')).toBeInTheDocument();
  });

  it('renders nothing when features array is empty', () => {
    const char = { ...baseCharacter, features: [] };
    const { container } = render(<ClassFeatures character={char} />);
    expect(container.innerHTML).toBe('');
  });
});
