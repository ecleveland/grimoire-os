import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import WeaponsTable from '../WeaponsTable';
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
  weapons: [
    { name: 'Longsword', attackBonus: '+6', damage: '1d8+3', damageType: 'Slashing', notes: 'Versatile (1d10)' },
    { name: 'Handaxe', attackBonus: '+6', damage: '1d6+3', damageType: 'Slashing' },
    { name: 'Fire Bolt', attackBonus: 'DC 14', damage: '2d10', damageType: 'Fire', notes: 'Cantrip, 120ft' },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('WeaponsTable', () => {
  it('renders the section header', () => {
    render(<WeaponsTable character={mockCharacter} />);
    expect(screen.getByText('Weapons & Damage Cantrips')).toBeInTheDocument();
  });

  it('renders all column headers', () => {
    render(<WeaponsTable character={mockCharacter} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Atk Bonus / DC')).toBeInTheDocument();
    expect(screen.getByText('Damage & Type')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('renders weapon rows with correct data', () => {
    render(<WeaponsTable character={mockCharacter} />);
    expect(screen.getByText('Longsword')).toBeInTheDocument();
    expect(screen.getByText('Handaxe')).toBeInTheDocument();
    expect(screen.getByText('Fire Bolt')).toBeInTheDocument();
    expect(screen.getByText('DC 14')).toBeInTheDocument();
    const bonusCells = screen.getAllByText('+6');
    expect(bonusCells).toHaveLength(2);
  });

  it('combines damage and damageType in the Damage & Type column', () => {
    render(<WeaponsTable character={mockCharacter} />);
    expect(screen.getByText('1d8+3 Slashing')).toBeInTheDocument();
    expect(screen.getByText('2d10 Fire')).toBeInTheDocument();
  });

  it('renders notes when present', () => {
    render(<WeaponsTable character={mockCharacter} />);
    expect(screen.getByText('Versatile (1d10)')).toBeInTheDocument();
    expect(screen.getByText('Cantrip, 120ft')).toBeInTheDocument();
  });

  it('renders empty cell when notes are undefined', () => {
    render(<WeaponsTable character={mockCharacter} />);
    const rows = screen.getAllByRole('row');
    // Header + 3 weapon rows
    expect(rows).toHaveLength(4);
    // Handaxe row (index 2) should have empty notes cell
    const handaxeCells = rows[2].querySelectorAll('td');
    expect(handaxeCells[3].textContent).toBe('');
  });

  it('renders nothing when weapons is undefined', () => {
    const char = { ...mockCharacter, weapons: undefined };
    const { container } = render(<WeaponsTable character={char} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when weapons is empty', () => {
    const char = { ...mockCharacter, weapons: [] };
    const { container } = render(<WeaponsTable character={char} />);
    expect(container.innerHTML).toBe('');
  });
});
